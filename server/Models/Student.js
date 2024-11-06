const mongoose = require('mongoose');

const studentSchema = new mongoose.Schema({
  regNumber: { type: String, unique: true },
  name: String,
  results: [
    {
      semesterId: { type: mongoose.Schema.Types.ObjectId, ref: 'Semester' },
      gpa: Number,
    },
  ],
});

module.exports = mongoose.model('Student', studentSchema);
