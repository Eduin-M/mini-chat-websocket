const express = require("express");
const http = require("http");
const WebSocket = require("ws");
const bcrypt = require("bcrypt");
const app = express();
const server = http.createServer(app);
const wss = new WebSocket.Server({ server });
const jwt = require("jsonwebtoken");
const db = require("./db");

const SECRET_KEY = process.env.JWT_SECRET || "dev-insecure-key-change-me";
const PORT = process.env.PORT || 8080;
const MAX_MESSAGE_LENGTH = 500;

if (!process.env.JWT_SECRET) {
  console.warn("⚠️ JWT_SECRET no está configurada. Usando clave temporal de desarrollo.");
}

app.use(express.json());

function sendToRoom(room, payload, excludeSocket = null) {
  wss.clients.forEach((client) => {
    if (
      client !== excludeSocket &&
      client.readyState === WebSocket.OPEN &&
      client.room === room
    ) {
      client.send(JSON.stringify(payload));
    }
  });
}

app.post("/login", (req, res) => {
  const { username, password } = req.body;
  if (typeof username !== "string" || typeof password !== "string") {
    return res.status(400).json({ error: "Datos inválidos" });
  }

  db.get(`SELECT * FROM users WHERE username = ?`, [username], (err, user) => {
    if (err) return res.status(500).json({ error: "Error del servidor" });
    if (!user) return res.status(401).json({ error: "Usuario no encontrado" });

    bcrypt
      .compare(password, user.password)
      .then((validPassword) => {
        if (!validPassword) {
          return res.status(401).json({ error: "Contraseña incorrecta" });
        }

        const token = jwt.sign({ username: user.username }, SECRET_KEY, {
          expiresIn: "1h",
        });
        return res.json({ token });
      })
      .catch(() => res.status(500).json({ error: "Error del servidor" }));
  });
});

app.post("/register", (req, res) => {
  const { username, password } = req.body;
  if (typeof username !== "string" || typeof password !== "string") {
    return res.status(400).json({ error: "Datos inválidos" });
  }

  if (!username || !password || username.length < 3 || password.length < 4) {
    return res.status(400).json({ error: "Datos inválidos" });
  }

  db.get(`SELECT * FROM users WHERE username = ?`, [username], (err, row) => {
    if (err) {
      return res.status(500).json({ error: "Error del servidor" });
    }
    if (row) {
      return res.status(409).json({ error: "El usuario ya existe" });
    }

    bcrypt
      .hash(password, 10)
      .then((hash) => {
        db.run(
          `INSERT INTO users (username, password) VALUES (?, ?)`,
          [username, hash],
          (insertErr) => {
            if (insertErr) {
              return res.status(500).json({ error: "Error al crear usuario" });
            }
            return res
              .status(201)
              .json({ message: "Usuario registrado exitosamente" });
          }
        );
      })
      .catch(() => res.status(500).json({ error: "Error del servidor" }));
  });
});

app.use(express.static("public"));

wss.on("connection", (socket, req) => {
  const requestUrl = new URL(req.url, `http://${req.headers.host || "localhost"}`);
  const token = requestUrl.searchParams.get("token");
  const room = (requestUrl.searchParams.get("room") || "general").trim().toLowerCase();

  if (!token) {
    socket.close(1008, "Token requerido");
    return;
  }

  let user;
  try {
    user = jwt.verify(token, SECRET_KEY);
    if (!user || typeof user.username !== "string" || !user.username.trim()) {
      throw new Error("Token sin username válido");
    }
    socket.user = { username: user.username.trim() };
    socket.room = room;
    console.log(`🔐 Usuario conectado: ${user.username}`);
    sendToRoom(
      socket.room,
      {
        type: "notice",
        content: `${socket.user.username} se ha conectado`,
      },
      socket
    );
  } catch (err) {
    console.log("❌ Token inválido");
    socket.close(1008, "Token inválido");
    return;
  }

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
      msg = JSON.parse(data.toString());
    } catch (e) {
      return;
    }

    if (!msg || typeof msg.type !== "string") return;

    if (msg.type === "typing") {
      sendToRoom(
        socket.room,
        { type: "typing", user: socket.user.username },
        socket
      );
      return;
    }

    if (msg.type !== "message" || typeof msg.content !== "string") return;
    const content = msg.content.trim();
    if (!content || content.length > MAX_MESSAGE_LENGTH) return;

    const payload = {
      type: "message",
      username: socket.user.username,
      content,
      timestamp: new Date().toISOString(),
    };

    db.run(`INSERT INTO messages (username, content, room) VALUES (?, ?, ?)`, [
      socket.user.username,
      content,
      socket.room,
    ]);

    sendToRoom(socket.room, payload);
  });

  socket.on("close", () => {
    if (!socket.user || !socket.room) return;
    sendToRoom(
      socket.room,
      {
        type: "notice",
        content: `${socket.user.username} se ha desconectado`,
      },
      socket
    );
  });
});

server.listen(PORT, () => {
  console.log(`🚀 Servidor corriendo en http://localhost:${PORT}`);
});
