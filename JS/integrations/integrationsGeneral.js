fetch('https://raw.githubusercontent.com/Circuit-Overtime/elixpo_ai_chapter/projects/projects.json')
    .then(response => response.json())
    .then(data => displayProjects(data))
    .catch(error => console.error('Error fetching the projects:', error));

function displayProjects(projects) {
    // Background image options
    const backgrounds = [
        "https://firebasestorage.googleapis.com/v0/b/elixpoai.appspot.com/o/Abstract%2Fabstract_five.jpg?alt=media&token=c4ac0442-dc53-4092-8e1d-2e69fca3da6c",
        "https://firebasestorage.googleapis.com/v0/b/elixpoai.appspot.com/o/Abstract%2Fabstract_four.jpg?alt=media&token=85d46adb-dd35-4ceb-bad5-4083aaa73ec5",
        "https://firebasestorage.googleapis.com/v0/b/elixpoai.appspot.com/o/Abstract%2Fabstract_one.jpg?alt=media&token=86978fed-cacb-445d-8382-bc0c93d1477b",
        "https://firebasestorage.googleapis.com/v0/b/elixpoai.appspot.com/o/Abstract%2Fabstract_three.jpg?alt=media&token=e53400fc-a10c-42cb-8459-249292ea07ce",
        "https://firebasestorage.googleapis.com/v0/b/elixpoai.appspot.com/o/Abstract%2Fabstract_two.jpg?alt=media&token=c715ed6c-0847-4c92-8747-2e8a509ed028"
    ];

    projects.forEach(project => {
        let details = "";
        let projectName = "Untitled Project";
        let projectOwner = "Unknown Owner";
        let projectDescription = "No description available.";
        let projectURL = "";
        let githubUrl = "";

        project.content.split("### ").filter(Boolean).forEach(section => {
            details += (section.split("\n\n").filter(Boolean)[1]) + "___";
          });
        
        let detailsArray = details.split("___");
        projectName = detailsArray[0].trim() || projectName;
        projectDescription = detailsArray[1].trim() || projectDescription;
        projectURL = detailsArray[2].trim() !== "_No response_" || "_No response" || "\n" ? detailsArray[2] : "";
        projectOwner = detailsArray[3]?.trim() ? detailsArray[3] : "Unknown Owner";
        githubUrl = detailsArray[4].trim() !== "_No response_" || "_No response" ? detailsArray[4] : "";
        console.log(githubUrl)

        // Assign a random background
        let randomBg = backgrounds[Math.floor(Math.random() * backgrounds.length)];

        let node = `
            <div class="projectTile">
                <div class="projectTile-content">
                    <p class="projectOwner"> by 
                        ${githubUrl.trim() != "_No response" ? `<a href="${githubUrl}" target="_blank" rel="noopener noreferrer">${projectOwner}</a>` : projectOwner}
                    </p>
                    <div class="projectTile-image" style="background-image: url('${randomBg}')">
                    </div>
                    <div class="projectTile-info-wrapper">
                        <div class="projectTile-info">
                            <div class="projectTile-info-title">
                                <h3 class="projectName">
                                    ${projectURL.trim() != "_No response_" || "_No response"|| "" || "\n" ? `<a href="${projectURL}" target="_blank" rel="noopener noreferrer">${projectName}</a>` : projectName}
                                </h3>  
                                <h4 class="projectDesc">${projectDescription}</h4>
                            </div>    
                        </div>
                    </div>
                </div>
            </div>
        `;

        document.getElementById('projectTiles').innerHTML += node;
    });
}
