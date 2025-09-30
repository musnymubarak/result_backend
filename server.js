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

// Loop through the first six sheets and store data for semester results
for (let i = 0; i < Math.min(6, workbook.SheetNames.length); i++) {
    const sheetName = workbook.SheetNames[i];
    const sheet = workbook.Sheets[sheetName];
    const sheetData = xlsx.utils.sheet_to_json(sheet);
    
    sheetData.forEach(record => {
        record['Semester'] = sheetName; // Assign the sheet name to the Semester field
    });

    semesterData.push(...sheetData);
}

// Load the GPA sheet (7th sheet) if it exists
if (workbook.SheetNames.length > 6) {
    const gpaSheet = workbook.Sheets[workbook.SheetNames[6]];
    gpaData.push(...xlsx.utils.sheet_to_json(gpaSheet));
}

// API endpoint to get results by registration number from semester sheets
app.get('/api/results/:year/:department/:number', (req, res) => {
    const { year, department, number } = req.params;
    const regNo = `${year}/${department}/${number}`; // Construct the full registration number

    // Filter semester data by registration number
    const filteredResults = semesterData.filter(record => record['Reg.No'] === regNo);

    if (filteredResults.length > 0) {
        const name = filteredResults[0]['Name'] || filteredResults[0]['Name_1'];
        const semesterResults = {};
        let overallGpa = 0;
        let totalSemesters = 0;

        // Gather results semester-wise and calculate GPA
        filteredResults.forEach(result => {
            const semesterKey = result['Semester'];

            if (!semesterResults[semesterKey]) {
                semesterResults[semesterKey] = {
                    courses: [],
                    semesterGPA: 0,
                };
            }

            const courseData = {};
            Object.entries(result)
                .filter(([key]) => !['Reg.No', 'Name', 'Name_1', 'GPA', 'Semester', 'Reg. No', 'Reg.No_1'].includes(key))
                .forEach(([key, value]) => {
                    courseData[key] = value;
                });

            if (Object.keys(courseData).length > 0) {
                semesterResults[semesterKey].courses.push(courseData);
            }

            const semesterGPA = parseFloat(result['GPA']);
            if (!isNaN(semesterGPA) && semesterGPA > 0) { // Ignore 0 or missing GPA
                semesterResults[semesterKey].semesterGPA = semesterGPA;
                overallGpa += semesterGPA;
                totalSemesters++;
            }
        });

        overallGpa = totalSemesters > 0 ? (overallGpa / totalSemesters).toFixed(3) : 'N/A';

        // Get official OCGPA from GPA sheet, if available
        const gpaRecord = gpaData.find(record => record['Reg.No'] === regNo);
        const ocGPA = gpaRecord ? parseFloat(gpaRecord['OCGPA']).toFixed(3) : 'N/A';

        res.json({
            regNo,
            name,
            semesterResults,
            overallGpa: ocGPA, // Use official OCGPA for consistency
            ocGPA
        });
    } else {
        res.status(404).json({ message: 'No results found for the given registration number.' });
    }
});

app.listen(PORT, () => {
    console.log(`Server is running on http://localhost:${PORT}`);
});