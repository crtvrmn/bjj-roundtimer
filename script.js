let socket;
//const  SOCKET_SERVER_URL= https://socket.theboilerroom.de
const SOCKET_SERVER_URL = "http://192.168.178.113:3001";
const roundElem = document.getElementById('round');
const timeElem = document.getElementById('time');
const matchesElem = document.getElementById('matches');
const pauseElem = document.getElementById('pause');
const startButton = document.getElementById('start');
const stopButton = document.getElementById('stop');
const configForm = document.getElementById('config-form');
const userForm = document.getElementById('user-form');
const editLogo = document.getElementById('edit-logo');
const logoutButton = document.getElementById('logout');
const resetButton = document.getElementById('reset');

let wakeLock = null;
let wakeLockEnabled = false;

async function requestWakeLock() {
    try {
        wakeLock = await navigator.wakeLock.request('screen');
        console.log('Wake Lock aktiviert!');
        wakeLockEnabled = true;
        wakeLock.addEventListener('release', () => {
            console.log('Wake Lock wurde freigegeben.');
            wakeLock = null;
            wakeLockEnabled = false;
        });
    } catch (err) {
        console.error(`${err.name}, ${err.message}`);
        wakeLockEnabled = false;
    }
}

async function releaseWakeLock() {
    if (wakeLock !== null) {
        await wakeLock.release();
        wakeLock = null;
        console.log('Wake Lock freigegeben!');
    }
    wakeLockEnabled = false;
}

function handleVisibilityChange() {
    if (document.visibilityState === 'visible' && wakeLockEnabled === false) {
        requestWakeLock();
    } else if (document.visibilityState === 'hidden' && wakeLock !== null) {
        releaseWakeLock();
    }
}

function handleBeforeUnload() {
    if (wakeLock !== null) {
        releaseWakeLock();
    }
}

function connectToSocket(username, sessionId) {
    socket = io(SOCKET_SERVER_URL, { query: { sessionId: sessionId, username: username, userAgentData: navigator.userAgentData ? JSON.stringify(navigator.userAgentData) : null } });

    socket.on('connect', () => {
        console.log('Connected to server');
        requestWakeLock();
    });

    socket.on('disconnect', () => {
        console.log('Disconnected from server');
    });

    window.config = {};

    socket.on('initialData', (data) => {
        console.log('Received initialData:', data);
        roundElem.textContent = `Round ${data.round}`;
        timeElem.textContent = data.roundTime;
        matchesElem.textContent = data.matches.matches;
        pauseElem.textContent = data.matches.pause;
        document.getElementById('combatants').value = JSON.stringify(data.combatants);
        document.getElementById('round-time').value = data.roundTime;
        document.getElementById('pause-time').value = data.pauseTime;
        window.config = data;
        userForm.classList.add('hidden');
        resetButton.disabled = false;
    });

    const sound3 = new Audio('sounds/23.mp3');
    const sound2 = new Audio('sounds/23.mp3');
    const sound1 = new Audio('sounds/1.mp3');
    const combatSound = new Audio('sounds/combat.mp3');

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
        timeElem.textContent = time;
        document.body.className = 'pause-running';
    });

    socket.on('roundUpdate', (data) => {
        console.log('Received initialData:', data);
        roundElem.textContent = `Round ${data.round}`;
        matchesElem.textContent = data.matches;
        pauseElem.textContent = data.pause ? `⏱️ ${data.pause}` : "";
        console.log(data.pause)
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
            resetButton.classList.add('hidden');
            stopButton.classList.remove('hidden');
        } else {
            console.log("Round is paused.")
            document.body.className = 'paused';
            startButton.classList.remove('hidden');
            resetButton.classList.remove('hidden');
            stopButton.classList.add('hidden');
        }
    });
}

window.onload = () => {
    const userForm = document.getElementById('user-form');
    const configForm = document.getElementById('config-form');

    // Versuche, gespeicherte Daten aus localStorage zu laden
    const savedUsername = localStorage.getItem('username');
    const savedSessionId = localStorage.getItem('sessionId');

    if (savedUsername && savedSessionId) {
        document.getElementById('username').value = savedUsername;
        document.getElementById('session-id').value = savedSessionId;
        userForm.classList.add('hidden'); // Verstecke das Formular
        connectToSocket(savedUsername, savedSessionId); // Verbinde sofort
    }

    userForm.addEventListener('submit', (event) => {
        event.preventDefault();
        const username = document.getElementById('username').value;
        const sessionId = document.getElementById('session-id').value;

        // Speichere Benutzername und Session-ID in localStorage
        localStorage.setItem('username', username);
        localStorage.setItem('sessionId', sessionId);

        connectToSocket(username, sessionId);
    });

    startButton.addEventListener('click', () => {
        console.log('Start button clicked, sending startTimer event');
        socket.emit('startTimer');
    });

    stopButton.addEventListener('click', () => {
        console.log('Stop button clicked, sending stopTimer event');
        socket.emit('stopTimer');
    });
    resetButton.addEventListener('click', () => {
        console.log('Reset button clicked');
        let roundTime = document.getElementById('time').value
        let isRoundRunning = roundTime > 0;
        let sessionId = document.getElementById('session-id').value
        let initialRoundTime = window.config.roundTime;
        let initialPauseTime = window.config.pauseTime;

        if (isRoundRunning) {
            socket.emit('stopTimer');
            console.log(`Round reset! sending stopTimer event and resetting round time to ${initialRoundTime}`);

            // Setze die Rundenzeit auf den ursprünglichen Wert zurück
            console.log(`Resetting Round Time from  ${roundTime} to: `, initialRoundTime)
            timeElem.textContent = initialRoundTime;
            document.getElementById('round-time').value = initialRoundTime;
            // socket.emit('updateConfig', { sessionId: sessionId, roundTime: initialRoundTime });
        } else {
            socket.emit('stopTimer');
            // Setze die Pausenzeit auf den ursprünglichen Wert zurück
            console.log(`Pause reset! sending stopTimer event and resetting pause time from ${roundTime} to ${initialPauseTime}`);
            console.log("Resetting Pause Time to: ", initialPauseTime)
            timeElem.textContent = initialPauseTime;
            document.getElementById('pause-time').value = initialPauseTime;
            //socket.emit('updateConfig', { sessionId: sessionId, roundTime: initialPauseTime });
        }

    });

    configForm.addEventListener('submit', (event) => {
        event.preventDefault();
        const roundTime = document.getElementById('round-time').value;
        const pauseTime = document.getElementById('pause-time').value;
        const combatants = document.getElementById('combatants').value;
        const sessionId = document.getElementById('session-id').value;

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


        socket.emit('updateConfig', {
            roundTime: roundTime,
            pauseTime: pauseTime,
            combatants: combatants,
            sessionId: sessionId
        });
        configForm.classList.add('hidden');
        setTimeout(() => {
            startButton.classList.remove('hidden');
        }, 100); // 100ms Verzögerung

    });

    editLogo.addEventListener('click', () => {
        socket.emit('stopTimer');
        configForm.classList.remove('hidden');
        setTimeout(() => {
            startButton.classList.add('hidden');
        }, 100); // 100ms Verzögerung
    });

    // Logout-Funktionalität
    logoutButton.addEventListener('click', () => {
        localStorage.removeItem('sessionId'); // Session-ID entfernen
        if (socket) {
            socket.disconnect(); // Socket-Verbindung trennen
        }
        userForm.classList.remove('hidden'); // Formular wieder anzeigen
    });

    document.addEventListener('visibilitychange', handleVisibilityChange);
    window.addEventListener('beforeunload', handleBeforeUnload);

    if ('wakeLock' in navigator) {
        console.log('Wake Lock API wird unterstützt!');
    } else {
        console.log('Wake Lock API wird NICHT unterstützt!');
    }
};