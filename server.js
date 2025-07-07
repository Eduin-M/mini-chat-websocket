const express = require("express");
const http = require("http");
const WebSocket = require("ws");
const bcrypt = require("bcrypt");
const app = express();
const server = http.createServer(app);
const wss = new WebSocket.Server({ server });
const jwt = require("jsonwebtoken");
const bodyParser = require("body-parser");
const db = require("./db"); // Asegúrate de que este archivo exista y esté configurado correctamente
const { type } = require("os");
const SECRET_KEY = "Eduin";

app.use(bodyParser.json());

app.post("/login", (req, res) => {
  const { username, password } = req.body;

  db.get(`SELECT * FROM users WHERE username = ?`, [username], (err, user) => {
    if (err) return res.status(500).json({ error: "Error del servidor" });
    if (!user) return res.status(401).json({ error: "Usuario no encontrado" });

    // Compara contraseña ingresada con hash
    const validPassword = bcrypt.compareSync(password, user.password);
    if (!validPassword)
      return res.status(401).json({ error: "Contraseña incorrecta" });

    const token = jwt.sign({ username: user.username }, SECRET_KEY, {
      expiresIn: "1h",
    });
    res.json({ token });
  });
});

app.post("/register", async (req, res) => {
  const { username, password } = req.body;

  if (!username || !password || username.length < 3 || password.length < 4) {
    return res.status(400).json({ error: "Datos inválidos" });
  }

  try {
    // Verifica si ya existe ese usuario
    db.get(
      `SELECT * FROM users WHERE username = ?`,
      [username],
      async (err, row) => {
        if (row) {
          return res.status(409).json({ error: "El usuario ya existe" });
        }

        // Encripta contraseña y guarda
        const hash = await bcrypt.hash(password, 10);
        db.run(
          `INSERT INTO users (username, password) VALUES (?, ?)`,
          [username, hash],
          (err) => {
            if (err)
              return res.status(500).json({ error: "Error al crear usuario" });
            return res
              .status(201)
              .json({ message: "Usuario registrado exitosamente" });
          }
        );
      }
    );
  } catch (error) {
    return res.status(500).json({ error: "Error del servidor" });
  }
});

app.use(express.static("public"));

wss.on("connection", (socket, req) => {
  const params = new URLSearchParams(req.url.replace("/?", ""));
  const token = params.get("token");
  const room = params.get("room") || "general";

  if (!token) {
    socket.close();
    return;
  }
  try {
    const user = jwt.verify(token, SECRET_KEY);
    socket.user = user;
    socket.room = room;
    console.log(`🔐 Usuario conectado: ${user.username}`);
    wss.clients.forEach((client) => {
      if (
        client !== socket &&
        client.readyState === WebSocket.OPEN &&
        client.room === socket.room
      ) {
        client.send(
          JSON.stringify({
            type: "notice",
            content: `${socket.user.username} se ha conectado`,
          })
        );
      }
    });
  } catch (err) {
    console.log("❌ Token inválido");
    socket.close();
    wss.clients.forEach((client) => {
      if (client.readyState === WebSocket.OPEN && client.room === socket.room) {
        client.send(
          JSON.stringify({
            type: "notice",
            content: `${socket.user.username} se ha desconectado`,
          })
        );
      }
    });

    return;
  }
  console.log("🔌 Cliente conectado");

  db.all(
    `SELECT * FROM messages WHERE room = ? ORDER BY timestamp DESC LIMIT 50`,
    [socket.room],
    (err, rows) => {
      if (!err) {
        rows.reverse().forEach((row) => {
          socket.send(
            JSON.stringify({
              type: "message",
              username: row.username,
              content: row.content,
              timestamp: row.timestamp,
            })
          );
        });
      }
    }
  );

  socket.on("message", (data) => {
    let msg;

    try {
      msg = JSON.parse(data); // Esperamos un JSON con tipo y contenido
    } catch (e) {
      return;
    }

    const payload = {
      type: "message",
      username: socket.user.username,
      content: msg.content,
      timestamp: new Date().toISOString(),
    };

    if (msg.type === "typing") {
      // Notifica a otros que el usuario está escribiendo
      wss.clients.forEach((client) => {
        if (
          client !== socket &&
          client.readyState === WebSocket.OPEN &&
          client.room === socket.room
        ) {
          client.send(
            JSON.stringify({ type: "typing", user: socket.user.username })
          );
        }
      });
      return;
    }

    // Mensaje normal
    const fullMsg = `${socket.user.username}: ${msg.content}`;

    // Guardar mensaje
    db.run(`INSERT INTO messages (username, content, room) VALUES (?, ?, ?)`, [
      socket.user.username,
      msg.content,
      socket.room,
    ]);

    // Enviar a todos
    wss.clients.forEach((client) => {
      if (client.readyState === WebSocket.OPEN && client.room === socket.room) {
        client.send(JSON.stringify(payload));
      }
    });
  });
});

server.listen(8080, () => {
  console.log("🚀 Servidor corriendo en http://localhost:8080");
});
