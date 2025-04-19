

let socket;
const  SOCKET_SERVER_URL=  "http://localhost:3001";
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
            startButton.classList.remove('hidden');
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
            timeElem.textContent = `PAUSE (${time})`;
            document.body.className = 'pause-running';
        });

        socket.on('roundUpdate', (data) => {
            console.log('Received initialData:', data);
            roundElem.textContent = `Round ${data.round}`;
            matchesElem.textContent = data.matches;
            pauseElem.textContent = `PAUSE ${data.pause}`;

            // Show pairings for the next round
            matchesElem.textContent = `${data.matches.matches}`;
        });
         socket.on('timerStarted', (username) => {
            startTimer();
            document.body.className = 'round-running';
            startButton.classList.add('hidden'); // Start Button verstecken
            stopButton.classList.remove('hidden'); // Stop Button anzeigen
     
        });
         socket.on('timerStopped', (username) => {
            stopTimer();
            document.body.className = 'paused';
            startButton.classList.remove('hidden'); // Start Button anzeigen
            stopButton.classList.add('hidden'); // Stop Button verstecken

        });

        let timerInterval;

        function startTimer() {
            if (!timerInterval) {
                timerInterval = setInterval(() => {
                    let currentTime = config.roundTime;
                    if (currentTime > 0) {
                        timeElem.textContent = currentTime - 1;
                        config.roundTime = currentTime - 1;
                    } else {
                        clearInterval(timerInterval);
                    }
                }, 1000);
            }
        }

        function stopTimer() {
            clearInterval(timerInterval);
            timerInterval = null;
        }
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
            combatants: combatants,
            sessionId: sessionId
        });
        configForm.classList.add('hidden'); //hide
    });

       // Event Listener für das Edit-Logo
       editLogo.addEventListener('click', () => {
        configForm.classList.remove('hidden'); // Entferne die 'hidden' Klasse, um das Formular anzuzeigen
    });
};