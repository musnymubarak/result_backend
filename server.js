const express = require('express');
const xlsx = require('xlsx');
const cors = require('cors');
const app = express();
const PORT = 4000;

app.use(cors());

// Load and parse the Excel file
const workbook = xlsx.readFile('data.xlsx'); // Ensure your file is correctly named and located
const semesterData = [];
const gpaData = [];

// Loop through the first four sheets and store data for semester results
for (let i = 0; i < Math.min(5, workbook.SheetNames.length); i++) {
    const sheetName = workbook.SheetNames[i];
    const sheet = workbook.Sheets[sheetName];
    const sheetData = xlsx.utils.sheet_to_json(sheet);
    
    sheetData.forEach(record => {
        record['Semester'] = sheetName; // Assign the sheet name to the Semester field
    });

    semesterData.push(...sheetData);
}

// Load the fifth sheet for GPA data, if it exists
if (workbook.SheetNames.length > 5) {
    const gpaSheet = workbook.Sheets[workbook.SheetNames[5]];
    gpaData.push(...xlsx.utils.sheet_to_json(gpaSheet));
}

// API endpoint to get results by registration number from semester sheets
app.get('/api/results/:year/:department/:number', (req, res) => {
    const { year, department, number } = req.params;
    const regNo = `${year}/${department}/${number}`; // Construct the full registration number

    // Filter semester data by registration number
    const filteredResults = semesterData.filter((record) => record['Reg.No'] === regNo);

    if (filteredResults.length > 0) {
        const name = filteredResults[0]['Name'] || filteredResults[0]['Name_1']; // Get the name from the first record
        const semesterResults = {};
        let overallGpa = 0;
        let totalSemesters = 0;

        // Gather results semester-wise and calculate overall GPA
        filteredResults.forEach((result) => {
            const semesterKey = result['Semester']; // Use the assigned sheet name as the semester key

            if (!semesterResults[semesterKey]) {
                semesterResults[semesterKey] = {
                    courses: [],
                    semesterGPA: 0, // Initialize semester GPA
                };
            }

            const courseData = {};
            Object.entries(result)
                .filter(([key]) => !['Reg.No', 'Name', 'Name_1', 'GPA', 'Semester', 'Reg. No', 'Reg.No_1'].includes(key))
                .forEach(([key, value]) => {
                    courseData[key] = value; // Combine subject results
                });

            if (Object.keys(courseData).length > 0) {
                semesterResults[semesterKey].courses.push(courseData);
            }

            const semesterGPA = parseFloat(result['GPA']); // Assuming GPA is available in the result
            if (!isNaN(semesterGPA)) {
                semesterResults[semesterKey].semesterGPA = semesterGPA; // Store semester GPA
                overallGpa += semesterGPA;
                totalSemesters++;
            }
        });

        overallGpa = totalSemesters > 0 ? (overallGpa / totalSemesters).toFixed(2) : 0;

        // Get OCGPA from the GPA data, if available
        const gpaRecord = gpaData.find(record => record['Reg.No'] === regNo);
        const ocGPA = gpaRecord ? gpaRecord['OCGPA'] : 'N/A'; // Assuming OCGPA is present in the GPA sheet

        // Prepare the final response
        res.json({
            regNo,
            name,
            semesterResults,
            overallGpa: overallGpa, // Overall GPA calculated from semester results
            ocGPA: ocGPA // Include OCGPA, default to 'N/A' if not found
        });
    } else {
        res.status(404).json({ message: 'No results found for the given registration number.' });
    }
});

app.listen(PORT, () => {
    console.log(`Server is running on http://localhost:${PORT}`);
});
