const express = require('express');
const authRoutes = require('./routes/auth');
const cvRoutes = require('./routes/cv');
const jobRoutes = require('./routes/job');
const cors = require('cors');

const app = express();

app.use(express.json());

app.use(cors());
app.use('/uploads', express.static('uploads'));

app.use('/api/auth', authRoutes);
app.use('/api/cv', cvRoutes); 
app.use('/api/job', jobRoutes)

const port = process.env.PORT || 3001;
app.listen(port, () => {
  console.log(`Server is running on port ${port}`);
});