// server.js
import express from 'express';
const app = express();
const port = 3000;

app.get('/ping', (req, res) => {
  res.send('OK');
});

app.listen(port, () => {
  console.log(`Server listening at http://localhost:${port}`);
});


//changed for test