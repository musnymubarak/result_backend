const mongoose = require('mongoose');

const semesterSchema = new mongoose.Schema({
  name: String,
  courses: [{ name: String, credits: Number }],
});

module.exports = mongoose.model('Semester', semesterSchema);
