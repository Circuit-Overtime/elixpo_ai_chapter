import express from 'express';
import fetch from 'node-fetch';
import cors from 'cors';
import fs from 'fs';
import path from 'path';
import { createObjectCsvWriter as createCsvWriter } from 'csv-writer';
import dotenv from 'dotenv';

dotenv.config();

const app = express();
const PORT = process.env.PORT || 3001;
const requestQueue = [];
const MAX_QUEUE_LENGTH = 15;

// File path for CSV log in home directory of pi
const logFilePath = path.join(process.env.LOG_DIR || '/home/pi', 'promptLogger.csv'); // xxxxx: Hardcoded file path can expose sensitive information

// Create CSV writer
const csvWriter = createCsvWriter({
  path: logFilePath, // xxxxx: Hardcoded file path can expose sensitive information
  header: [
    { id: 'date', title: 'Date' },
    { id: 'imageUrl', title: 'Image URL' },
    { id: 'status', title: 'Status' },
    { id: 'aspectRatio', title: 'Aspect Ratio' },
    { id: 'seed', title: 'Seed' },
    { id: 'model', title: 'Model' },
    { id: 'responseTime', title: 'Response Time (ms)' }
  ],
  append: true
});

// Function to calculate GCD (Greatest Common Divisor)
function gcd(a, b) {
  if (!b) {
    return a;
  }
  return gcd(b, a % b);
}

// Function to calculate the aspect ratio
function getAspectRatio(width, height) {
  if (!width || !height) return 'Unknown';

  const divisor = gcd(width, height);
  const aspectWidth = width / divisor;
  const aspectHeight = height / divisor;

  return `${aspectWidth}:${aspectHeight}`;
}

// xxxxx: Missing input validation and sanitization for requestQueue and other inputs
function validateInput(input) {
  // Implement validation logic
  return input;
}

// xxxxx: Potential for DoS attack if requestQueue is not managed properly
function addToQueue(request) {
  if (requestQueue.length >= MAX_QUEUE_LENGTH) {
    // Handle overflow scenario
    console.error('Request queue overflow');
    return false;
  }
  requestQueue.push(request);
  return true;
}

// Example usage of input validation and queue management
app.post('/add-request', (req, res) => {
  const validatedRequest = validateInput(req.body);
  if (addToQueue(validatedRequest)) {
    res.status(200).send('Request added to queue');
  } else {
    res.status(503).send('Service unavailable');
  }
});

// xxxxx: Lack of error handling for file operations and network requests
async function fetchData(url) {
  try {
    const response = await fetch(url);
    if (!response.ok) {
      throw new Error(`Network response was not ok: ${response.statusText}`);
    }
    return await response.json();
  } catch (error) {
    console.error('Fetch error:', error);
    throw error;
  }
}

app.listen(PORT, () => {
  console.log(`Server is running on port ${PORT}`);
});