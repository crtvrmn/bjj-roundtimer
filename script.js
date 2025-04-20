let socket;
//const  SOCKET_SERVER_URL= https://socket.theboilerroom.de 
const SOCKET_SERVER_URL = "http://localhost:3001";
const roundElem = document.getElementById('round');
const timeElem = document.getElementById('time');
const matchesElem = document.getElementById('matches');
const pauseElem = document.getElementById('pause');
const startButton = document.getElementById('start');
const stopButton = document.getElementById('stop');
const configForm = document.getElementById('config-form');
const userForm = document.getElementById('user-form');
const editLogo = document.getElementById('edit-logo');


// Setze die Session-ID im Formular
//document.getElementById('session-id').value = sessionId;

window.onload = () => {
    const userForm = document.getElementById('user-form');
    const configForm = document.getElementById('config-form');

    userForm.addEventListener('submit', (event) => {
        event.preventDefault();

        const username = document.getElementById('username').value;
        const sessionId = document.getElementById('session-id').value;

        socket = io(SOCKET_SERVER_URL, { query: { sessionId: sessionId, username: username } });

        socket.on('connect', () => {
            console.log('Connected to server');
        });

        let config;
        socket.on('initialData', (data) => {
            console.log('Received initialData:', data);
            roundElem.textContent = `Round ${data.round}`;
            timeElem.textContent = data.roundTime;
            matchesElem.textContent = data.matches.matches;
            pauseElem.textContent = data.matches.pause;
            document.getElementById('combatants').value = JSON.stringify(data.combatants);
            document.getElementById('round-time').value = data.roundTime;
            document.getElementById('pause-time').value = data.pauseTime;
            config = data;

            userForm.classList.add('hidden');

        });

        const sound3 = new Audio('sounds/23.mp3');
        const sound2 = new Audio('sounds/23.mp3');
        const sound1 = new Audio('sounds/1.mp3');
        const combatSound = new Audio('sounds/combat.mp3');
        //  const soundPause = new Audio('path/to/soundPause.mp3');

        socket.on('playSound', (second) => {
            console.log(`playSound Event erhalten, Sekunde: ${second}`);
            switch (second) {
                case "combat":
                    combatSound.play()
                        .catch(error => console.error('Fehler beim Abspielen von CombatSound:', error));
                    break;
                case 3:
                    sound3.play()
                        .catch(error => console.error('Fehler beim Abspielen von Sound 3:', error));
                    break;
                case 2:
                    sound2.play()
                        .catch(error => console.error('Fehler beim Abspielen von Sound 2:', error));
                    break;
                case 1:
                    sound1.play()
                        .catch(error => console.error('Fehler beim Abspielen von Sound 1:', error));
                    break;
            }
        });

        socket.on('configUpdated', (newConfig) => {
            console.log('Config updated:', newConfig);
            // Aktualisiere die Anzeige mit den neuen Werten
            document.getElementById('round-time').value = newConfig.roundTime;
            timeElem.textContent = newConfig.roundTime;
            document.getElementById('pause-time').value = newConfig.pauseTime;
            document.getElementById('combatants').value = JSON.stringify(newConfig.combatants);
            config = newConfig;
        });


        socket.on('roundTimeUpdate', (time) => {
            timeElem.textContent = time;
            document.body.className = 'round-running';
        });

        socket.on('pauseTimeUpdate', (time) => {
            timeElem.textContent = `PAUSE \n${time}`;
            document.body.className = 'pause-running';
        });

        socket.on('roundUpdate', (data) => {
            console.log('Received initialData:', data);
            roundElem.textContent = `Round ${data.round}`;
            matchesElem.textContent = data.matches;
            pauseElem.textContent = data.pause ? `⏱️ ${data.pause}` : "";
            console.log(data.pause)
            // Show pairings for the next round
            matchesElem.textContent = `${data.matches.matches}`;

        });
        socket.on('timerStarted', (username) => {
        });
        socket.on('timerStopped', (username) => {


        });

        socket.on('timerStatus', (isTimerRunning) => {
            startButton.classList.add('hidden');
            stopButton.classList.add('hidden');
            if (isTimerRunning) {
                console.log("Round is Running!")
                document.body.className = 'round-running';
                startButton.classList.add('hidden');
                stopButton.classList.remove('hidden');
            } else {
                console.log("Round is paused.")
                document.body.className = 'paused';
                startButton.classList.remove('hidden');
                stopButton.classList.add('hidden');
            }
        });
    });

    startButton.addEventListener('click', () => {
        console.log('Start button clicked, sending startTimer event');
        socket.emit('startTimer');
    });

    stopButton.addEventListener('click', () => {
        console.log('Stop button clicked, sending stopTimer event');
        socket.emit('stopTimer');
    });

    configForm.addEventListener('submit', (event) => {
        event.preventDefault();

        const roundTime = document.getElementById('round-time').value;
        const pauseTime = document.getElementById('pause-time').value;
        const combatants = document.getElementById('combatants').value;
        const sessionId = document.getElementById('session-id').value;

        // Validate inputs
        if (!roundTime || isNaN(roundTime) || roundTime <= 0) {
            alert('Please enter a valid round time (positive number).');
            return;
        }

        if (!pauseTime || isNaN(pauseTime) || pauseTime <= 0) {
            alert('Please enter a valid pause time (positive number).');
            return;
        }

        try {
            JSON.parse(combatants);
        } catch (e) {
            alert('Please enter a valid JSON string for combatants.');
            return;
        }

        // Sende die Konfiguration an den Server
        socket.emit('updateConfig', {
            roundTime: roundTime,
            pauseTime: pauseTime,
            combatants: combatants, //update the round-robin!
            sessionId: sessionId
        });
        configForm.classList.add('hidden'); //hide
    });

    // Event Listener für das Edit-Logo
    editLogo.addEventListener('click', () => {
        socket.emit('stopTimer');
        configForm.classList.remove('hidden'); // Entferne die 'hidden' Klasse, um das Formular anzuzeigen
    });
};