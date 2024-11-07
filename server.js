const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const path = require('path');

const app = express();
const server = http.createServer(app);
const io = new Server(server);

const rooms = {}; // Stockage des salles et utilisateurs
const quizzes = {}; // Stockage des quizzes par ID de salle
const quizStarted = {}; // Stockage de l'état de démarrage des quizzes par ID de salle

// Servir les fichiers statiques (comme Gimkit.mp3) depuis le dossier "public"
app.use(express.static(path.join(__dirname, 'public')));

app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

io.on('connection', (socket) => {
  console.log('Un utilisateur s\'est connecté :', socket.id);

  // Créer une salle
  socket.on('createRoom', (username) => {
    const roomId = Math.floor(1000 + Math.random() * 9000); // Générer un ID de salle aléatoire
    rooms[roomId] = { host: socket.id, users: [{ id: socket.id, username }] };
    socket.join(roomId);
    socket.emit('roomCreated', roomId, rooms[roomId].users);
    console.log(`Salle ${roomId} créée par ${username}`);
    io.to(roomId).emit('updateUserList', rooms[roomId].users);
  });

  // Rejoindre une salle
  socket.on('joinRoom', (roomId, username) => {
    joinRoom(socket, roomId, username);
  });

  // Gestion de la déconnexion
  socket.on('disconnect', () => {
    console.log(`Utilisateur déconnecté : ${socket.id}`);
    for (const roomId in rooms) {
      rooms[roomId].users = rooms[roomId].users.filter(user => user.id !== socket.id);
      if (rooms[roomId].users.length === 0) {
        delete rooms[roomId]; // Supprimer la salle si elle est vide
      } else {
        io.to(roomId).emit('updateUserList', rooms[roomId].users); // Mettre à jour la liste si quelqu'un quitte
        console.log(`updateUserList event emitted for room ${roomId} with users:`, rooms[roomId].users);
      }
    }
  });

  // Quitter explicitement la salle
  socket.on('leaveRoom', () => {
    console.log(`Utilisateur a quitté la salle: ${socket.id}`);
    for (const roomId in rooms) {
      rooms[roomId].users = rooms[roomId].users.filter(user => user.id !== socket.id);
      if (rooms[roomId].users.length === 0) {
        delete rooms[roomId];
      } else {
        io.to(roomId).emit('updateUserList', rooms[roomId].users);
        console.log(`updateUserList event emitted for room ${roomId} with users:`, rooms[roomId].users);
      }
    }
    socket.leave();
  });

  // Handle request for updated user list
  socket.on('requestUserList', (roomId) => {
    if (rooms[roomId]) {
      socket.emit('updateUserList', rooms[roomId].users);
      console.log(`User list requested for room ${roomId}:`, rooms[roomId].users);
    }
  });

  // Handle quiz file upload
  socket.on('uploadQuiz', (roomId, quiz) => {
    if (rooms[roomId] && socket.id === rooms[roomId].host) {
      try {
        const parsedQuiz = JSON.parse(quiz);
        if (validateQuiz(parsedQuiz)) {
          quizzes[roomId] = parsedQuiz;
          quizStarted[roomId] = false;
          io.to(roomId).emit('quizUploaded', parsedQuiz); // Emit the quizUploaded event with the quiz data
          console.log(`Quiz uploaded for room ${roomId}:`, parsedQuiz);
        } else {
          socket.emit('quizUploaded', false);
          console.log(`Invalid quiz format for room ${roomId}`);
        }
      } catch (e) {
        socket.emit('quizUploaded', false);
        console.log(`Error parsing quiz for room ${roomId}:`, e);
      }
    }
  });

  // Handle starting the game
  socket.on('startGame', (roomId) => {
    if (rooms[roomId] && socket.id === rooms[roomId].host) {
      console.log(`Starting game for room ${roomId}`);
      quizStarted[roomId] = true;
      io.to(roomId).emit('startGame', quizzes[roomId]);
      console.log(`Game started for room ${roomId} with quiz:`, quizzes[roomId]);
    } else {
      console.log(`Failed to start game for room ${roomId}`);
    }
  });

  // Handle request for quiz and started status
  socket.on('requestQuizStatus', (roomId) => {
    if (quizzes[roomId] && quizStarted[roomId] !== undefined) {
      socket.emit('quizStatus', quizzes[roomId], quizStarted[roomId]);
      console.log(`Quiz status requested for room ${roomId}:`, quizzes[roomId], quizStarted[roomId]);
    }
  });

  // Function to handle joining a room
  function joinRoom(socket, roomId, username) {
    console.log(`Tentative de rejoindre la salle ${roomId} par ${username} avec l'ID de socket ${socket.id}`);

    if (rooms[roomId]) {
      rooms[roomId].users.push({ id: socket.id, username });
      socket.join(roomId);
      console.log(`Utilisateur ${username} a rejoint la salle ${roomId}`);
      io.to(roomId).emit('updateUserList', rooms[roomId].users); // Mettre à jour la liste des utilisateurs
      console.log(`updateUserList event emitted for room ${roomId} with users:`, rooms[roomId].users);
      socket.emit('roomJoined', roomId, rooms[roomId].users, rooms[roomId].host);
    } else {
      socket.emit('error', 'ID de salle incorrect');
    }
  }

  // Function to validate quiz format
  function validateQuiz(quiz) {
    if (!quiz.title || !quiz.description || !quiz.author || !Array.isArray(quiz.questions)) {
      return false;
    }
    for (const question of quiz.questions) {
      if (!question.questionText || !Array.isArray(question.answers) || question.answers.length < 2) {
        return false;
      }
    }
    return true;
  }
});

server.listen(3000, () => {
  console.log('Serveur en écoute sur le port 3000');
});