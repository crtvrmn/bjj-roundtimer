
const FRONTEND_URL = "*";
const express = require('express');
const http = require('http');
const { Server } = require("socket.io");
const fs = require('fs');

const app = express();
const server = http.createServer(app);
const io = new Server(server, {
    cors: {
        //origin: "http://meinedomain.de",
        origin: FRONTEND_URL,
        methods: ["GET", "POST"]
    }
});

const sessions = {};
let sessionId = 0
globalThis.configFilename = `config-${sessionId}.json`;
let isTimerRunning = false;

function loadConfig(sessionId) {

    try {
        const config = JSON.parse(fs.readFileSync(configFilename, 'utf-8'));
        return {
            roundTime: parseInt(config.roundTime),
            pauseTime: parseInt(config.pauseTime),
            combatants: config.combatants,
            round: 1
        };
    } catch (error) {
        console.error(`Error loading ${configFilename}:`, error);
        const defaultConfig = {
            roundTime: 300,
            pauseTime: 60,
            combatants: {}
        };
        try {
            fs.writeFileSync(configFilename, JSON.stringify(defaultConfig, null, 2), 'utf-8');
            console.log(`Created default configuration for session ${sessionId} in ${configFilename}`);
            return {
                roundTime: defaultConfig.roundTime,
                pauseTime: defaultConfig.pauseTime,
                combatants: defaultConfig.combatants,
                round: 1
            };
        } catch (writeError) {
            console.error(`Error writing default configuration to ${configFilename}:`, writeError);
            return {
                roundTime: 300,
                pauseTime: 60,
                combatants: {},
                round: 1
            };
        }
    }
}

function saveConfig(sessionId, config) {
    if (config.roundTime !== undefined) {
        config.roundTime = parseInt(config.roundTime, 10);
    }
    if (config.pauseTime !== undefined) {
        config.pauseTime = parseInt(config.pauseTime, 10);
    }
    try {
        fs.writeFileSync(configFilename, JSON.stringify(config, null, 2), 'utf-8');
        console.log(`Configuration saved to ${configFilename}`);
    } catch (error) {
        console.error(`Error saving configuration to ${configFilename}:`, error);
    }
}

function roundRobinPairing(combatants, round, username) {
    const combatantList = Object.values(combatants);
    const numCombatants = combatantList.length;
    // If there are an odd number of combatants, add a "PAUSE"
    if (numCombatants % 2 !== 0) {
        combatantList.push("PAUSE");
    }

    // Rotate the combatant list based on the round number
    const rotatedList = rotateList(combatantList, round);

    let roundPairs = [];
    let userIsInMatch = false;
    for (let i = 0; i < rotatedList.length / 2; i++) {
        const fighter1 = rotatedList[i];
        const fighter2 = rotatedList[rotatedList.length - 1 - i];
        roundPairs.push(`${fighter1} : ${fighter2}`);

        if (fighter1 === username || fighter2 === username) {
            userIsInMatch = true;
        }
    }
    let match_list = "";
    let on_pause = "";
    roundPairs.forEach(entry => {
        if (!entry.includes("PAUSE")) {
            match_list += entry + "\n";
        } else {
            on_pause = doingPause(entry);
        }
    });

    return {
        matches: match_list,
        pause: on_pause,
        rotatedList: rotatedList,
        userIsInMatch: userIsInMatch
    };
}

function rotateList(combatant_list, round) {
    if (combatant_list.length <= 1) return combatant_list;
    const firstElement = combatant_list[0];
    const rest = combatant_list.slice(1);
    const rotation = round % rest.length;
    const rotatedRest = [...rest.slice(rotation), ...rest.slice(0, rotation)];
    return [firstElement, ...rotatedRest];
}

function doingPause(entry) {
    const parts = entry.split(" : ");
    if (parts.length === 2) {
        return parts[0] === "PAUSE" ? parts[1] : parts[0];
    }
    return "";
}

function advanceRound(sessionId) {
    const session = sessions[sessionId]; // Hole die Session-Daten

    if (!session) {
        console.error(`Session ${sessionId} not found in advanceRound.`);
        return;
    }

    session.round++;
    let currentMatches = roundRobinPairing(session.combatants, session.round);
    console.log(`Session ${sessionId} roundUpdate: Round ${session.round}, \nmatches: ${currentMatches.matches}`);
    io.to(sessionId).emit('roundUpdate', { round: session.round, matches: currentMatches, pause: currentMatches.pause }); // Send update to all clients in the session

    // Reset round and pause times
    session.roundTime = typeof session.config.roundTime === 'number' && session.config.roundTime > 0
        ? session.config.roundTime
        : 300; // Default to 300 if invalid

    session.pauseTime = typeof session.config.pauseTime === 'number' && session.config.pauseTime > 0
        ? session.config.pauseTime
        : 60; // Default to 60 if invalid
    // Restart timer for the next round

}

function updateTime(sessionId) {
    const session = sessions[sessionId];
    if (!session) {
        console.error(`Session ${sessionId} not found.`);
        return;
    }

    if (session.roundTime > 0) {
        io.to(sessionId).emit('roundTimeUpdate', session.roundTime);
        console.log(session.roundTime)
        if (session.roundTime === session.config.roundTime) {
            io.to(sessionId).emit('playSound', "combat");
        }
        if (session.roundTime <= 3) {
            io.to(sessionId).emit('playSound', session.roundTime);
        }
        session.roundTime--;
    } else if (session.pauseTime > 1) {
        console.log(session.pauseTime)
        io.to(sessionId).emit('pauseTimeUpdate', session.pauseTime);

        if (session.pauseTime === session.config.pauseTime) {
            // Berechne und sende die Matches der nächsten Runde zu Beginn der Pause
            const nextRoundMatches = roundRobinPairing(session.combatants, session.round + 1);
            console.log(nextRoundMatches)
            io.to(sessionId).emit('roundUpdate', { round: session.round + 1, matches: nextRoundMatches, pause: nextRoundMatches.pause });
            console.log(`Session ${sessionId} Comming Up Next: Round ${session.round + 1}, \nmatches: ${nextRoundMatches.matches}`);
        }
        session.pauseTime--;

    } else {

        console.log(session.pauseTime)
        io.to(sessionId).emit('pauseTimeUpdate', session.pauseTime);
        console.log(`Round ${session.round} over for session ${sessionId}, advancing to round ${session.round + 1}`);
        session.pauseTime--;
        advanceRound(sessionId);

    }
}

io.on('connection', (socket) => {
    const sessionId = socket.handshake.query.sessionId;
    const username = socket.handshake.query.username;


    if (!sessionId) {
        console.error('No session ID provided');
        socket.disconnect(true); // Trenne die Verbindung
        return;
    }

    if (!username) {
        console.error('No username provided');
        socket.disconnect(true); // Trenne die Verbindung
        return;
    }

    socket.join(sessionId); // Füge den Socket dem Raum hinzu
    io.to(sessionId).emit('timerStatus', isTimerRunning)
    console.log(`Timer Running is currently: ${isTimerRunning}`)
    console.log(`User ${username} connected to session ${sessionId}` + (sessions[sessionId] ? `,(roundTime: ${sessions[sessionId].roundTime} seconds, pauseTime: ${sessions[sessionId].pauseTime} seconds)` : ``));

    // Session-Daten initialisieren, falls noch nicht vorhanden
    if (!sessions[sessionId]) {
        sessions[sessionId] = {
            config: loadConfig(sessionId), // Konfiguration laden
            roundTime: loadConfig(sessionId).roundTime, // Aktuelle Rundenzeit
            pauseTime: loadConfig(sessionId).pauseTime,
            combatants: loadConfig(sessionId).combatants,
            round: loadConfig(sessionId).round,
            timerInterval: null, // Timer-Intervall
            users: {} // Objekt zum Speichern der Benutzernamen
        };
    }

    // Speichere den Benutzernamen für diese Session
    sessions[sessionId].users[socket.id] = username;
    // Überprüfe, ob der Benutzer bereits in den combatants ist, wenn nicht, füge ihn hinzu
    if (!Object.values(sessions[sessionId].combatants).includes(username)) {
        const newCombatantId = Object.keys(sessions[sessionId].combatants).length + 1;
        sessions[sessionId].combatants[newCombatantId] = username;
    }

    // Initial matches berechnen
    let currentMatches = roundRobinPairing(sessions[sessionId].combatants, sessions[sessionId].round, username);
    console.log(` -> ${username} joined combatants: ${JSON.stringify(sessions[sessionId].combatants)}`)
    // Sende die aktualisierten Daten an alle Clients in der Session
    io.to(sessionId).emit('initialData', {
        roundTime: sessions[sessionId].roundTime,
        round: sessions[sessionId].round,
        matches: currentMatches,
        userIsInMatch: currentMatches.userIsInMatch, // Sende das Flag mit
        combatants: sessions[sessionId].combatants, // Sende die aktualisierte Kämpferliste mit
        pauseTime: sessions[sessionId].pauseTime,
    });


    socket.on('startTimer', () => {
        console.log(`Received startTimer event from session ${sessionId} from user ${username}`);
        if (!sessions[sessionId].timerInterval) {
            sessions[sessionId].timerInterval = setInterval(() => updateTime(sessionId), 1000);
        }
        io.to(sessionId).emit('timerStarted', username);

        isTimerRunning = true;

        io.to(sessionId).emit('timerStatus', isTimerRunning)
    });

    socket.on('stopTimer', () => {
        console.log(`Received stopTimer event from session ${sessionId} from user ${username}`);
        if (sessions[sessionId].timerInterval) {
            clearInterval(sessions[sessionId].timerInterval);
            sessions[sessionId].timerInterval = null;
            io.to(sessionId).emit('timerStopped', username);

            isTimerRunning = false;

            io.to(sessionId).emit('timerStatus', isTimerRunning)
        }
    });



    socket.on('updateConfig', (data) => {
        const { sessionId, roundTime, pauseTime, combatants } = data;

        console.log(`Received updateConfig event from session ${sessionId} with data:`, data);

        if (sessions[sessionId]) {
            sessions[sessionId].config = {
                roundTime: roundTime,
                pauseTime: pauseTime,
                combatants: JSON.parse(combatants)
            };

            sessions[sessionId].roundTime = parseInt(roundTime);
            sessions[sessionId].pauseTime = parseInt(pauseTime);
            sessions[sessionId].combatants = JSON.parse(combatants);

            saveConfig(sessionId, sessions[sessionId].config);
            io.to(sessionId).emit('configUpdated', sessions[sessionId].config);
        } else {
            console.error(`Session ${sessionId} not found`);
        }
    });
});
const PORT = process.env.PORT || 3001;
server.listen(PORT, '0.0.0.0', () => {
    console.log(`Server listening on port ${PORT}`);
});