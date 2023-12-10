import Chart from 'chart.js/auto';
import { createCanvas, loadImage } from 'canvas';
import fs from 'fs';
import path from 'path';
import 'dotenv/config'
import readline from 'readline';
import DataStore from './services/data-store.js';

import serverNamePlugin from './chart-plugins/server-name.js';
import chartBackgroundPlugin from './chart-plugins/chart-background.js';
import layerTextPlugin from './chart-plugins/layer-text.js';
import serverVersionPlugin from './chart-plugins/server-version.js';
import serverCPUPlugin from './chart-plugins/server-cpu.js';

import tpsColorGradient from './chart-functions/tps-color-gradient.js';
import tpsColorGradientBackground from './chart-functions/tps-color-gradient-background.js';

const INPUT_DIR = 'input-logs';
const OUPUT_DIR = 'output-graphs';

async function main() {
    const files = fs.readdirSync(INPUT_DIR).filter(f => f.endsWith('.log'));
    console.log(`Logs found (${files.length}):\n > ${files.join(`\n > `)}`);

    if (!fs.existsSync(INPUT_DIR)) {
        fs.mkdirSync(INPUT_DIR)
        fs.writeFileSync(path.join(OUPUT_DIR, '.gitkeep'), '')
    }
    if (!fs.existsSync(OUPUT_DIR)) {
        fs.mkdirSync(OUPUT_DIR)
        fs.writeFileSync(path.join(OUPUT_DIR, '.gitkeep'), '')
    }

    const filesToAnalyze = files.map(async (logFile) => {
        const logPath = path.join(INPUT_DIR, logFile);
        const fileNameNoExt = logFile.replace(/\.[^\.]+$/, '');
        const outputPath = path.join(OUPUT_DIR, `${fileNameNoExt}.png`)

        try {
            await fs.promises.access(logPath, fs.constants.R_OK)
        } catch (error) {
            console.log(`\n\x1b[1m\x1b[34mUnable to read: \x1b[32m${fileNameNoExt}\x1b[0m`)
        }

        const graph = await drawGraph(logPath, fileNameNoExt)

        fs.writeFileSync(outputPath, graph.toBuffer("image/png"))
    })

    await Promise.all(filesToAnalyze);
}

function drawGraph(logPath, fileNameNoExt) {
    const startTime = Date.now();
    return new Promise((resolve, reject) => {
        const data = new DataStore();

        let serverName = '';
        let serverVersion = '';
        let serverCPU = '';
        let serverVersionMajor = 0;

        let maxQueue = 0;

        let uniqueClientNetSpeedValues = new Set();

        let explosionCountersPerController = []
        let serverMoveTimestampExpiredPerController = []
        let pawnsToPlayerNames = []
        let chainIdToPlayerController = []
        let playerNameToPlayerController = []
        let playerControllerToPlayerName = []
        let playerControllerToSteamID = []
        let steamIDToPlayerController = new Map();
        let killsPerPlayerController = []
        let connectionTimesByPlayerController = []
        let disconnectionTimesByPlayerController = []
        let playerControllerToNetspeed = []

        const fileStream = fs.createReadStream(logPath);
        const rl = readline.createInterface({
            input: fileStream,
            crlfDelay: Infinity,
        });

        let totalLines = 0;
        rl.on("line", (line) => {
            totalLines++;
            let regex, res;

            regex = /\[(.+)\]\[\d+\]LogSquad: .+: Server Tick Rate: (\d+.?\d+)/;
            res = regex.exec(line);
            if (res) {
                const timePoint = getDateTime(res[ 1 ]);
                data.addTimePoint(timePoint);

                data.setNewCounterValue('tickRate', Math.round(+res[ 2 ]))
                return;
            }

            regex = / ServerName: \'(.+)\' RegisterTimeout:/
            res = regex.exec(line);
            if (res) {
                serverName = res[ 1 ];
                return;
            }

            regex = /LogInit: OS: .+, CPU: (.+), GPU:/
            res = regex.exec(line);
            if (res) {
                serverCPU = res[ 1 ];
                return;
            }

            regex = /LogNetVersion: Set ProjectVersion to (V.+)\. Version/
            res = regex.exec(line);
            if (res) {
                serverVersion = res[ 1 ];
                serverVersionMajor = +serverVersion.substring(1, 2)
                return;
            }

            regex = /NotifyAcceptingChannel/;
            res = regex.exec(line);
            if (res) {
                const val = data.incrementCounter('queue', 1).y;
                if (val > maxQueue) maxQueue = val;
            }
            regex = /AUTH HANDLER: Sending auth result to user .+ with flag success\? 0/;
            res = regex.exec(line);
            if (res) {
                data.incrementFrequencyCounter('queueDisconnections', 3);
                return;
            }
            regex = /LogOnline: Warning: STEAM: AUTH: Ticket from user .+ is empty/;
            res = regex.exec(line);
            if (res) {
                // steamEmptyTicket[ steamEmptyTicket.length - 1 ].y += 1;
                data.incrementFrequencyCounter('steamEmptyTicket', 1)
                return;
            }

            regex = /CloseBunch/
            res = regex.exec(line);
            if (res) {
                // queuePoints[ queuePoints.length - 1 ].y -= 1;
                data.incrementCounter('queue', -1)
            }

            regex = /LogSquad: PostLogin: NewPlayer:/;
            res = regex.exec(line);
            if (res) {
                data.incrementCounter('players', 1);
            }

            regex = /^\[([0-9.:-]+)]\[([ 0-9]*)]LogNet: UChannel::Close: Sending CloseBunch\. ChIndex == [0-9]+\. Name: \[UChannel\] ChIndex: [0-9]+, Closing: [0-9]+ \[UNetConnection\] RemoteAddr: (.+):[0-9]+, Name: (Steam|EOSIp)NetConnection_[0-9]+, Driver: GameNetDriver (Steam|EOS)NetDriver_[0-9]+, IsServer: YES, PC: ([^ ]+PlayerController_C_[0-9]+), Owner: [^ ]+PlayerController_C_[0-9]+/
            res = regex.exec(line);
            if (res) {
                data.incrementCounter('players', -1);
                disconnectionTimesByPlayerController[ res[ 6 ] ] = getDateTime(res[ 1 ])
                return;
            }

            regex = /LogOnlineGame: Display: Kicking player: .+ ; Reason = Host closed the connection/;
            res = regex.exec(line);
            if (res) {
                data.incrementFrequencyCounter('hostClosedConnection', 3)
                return;
            }

            regex = /\[(.+)\].+LogSquad: OnPreLoadMap: Loading map .+\/([^\/]+)$/;
            res = regex.exec(line);
            if (res) {
                const timePoint = getDateTime(res[ 1 ]);
                data.setNewCounterValue('layers', 150, res[ 2 ], timePoint)
                return;
            }

            regex = /\[(.+)\]\[\d+].*LogWorld: SeamlessTravel to: .+\/([^\/]+)$/;
            res = regex.exec(line);
            if (res) {
                data.setNewCounterValue('layers', 150, res[ 2 ])
                return;
            }

            regex = /Frag_C.*DamageInstigator=([^ ]+PlayerController_C_\d+) /;
            res = regex.exec(line);
            if (res) {
                data.incrementFrequencyCounter('frags', 1)

                const playerController = res[ 1 ];
                if (!explosionCountersPerController[ playerController ]) explosionCountersPerController[ playerController ] = 0;
                explosionCountersPerController[ playerController ]++;
                return;
            }

            regex = /ServerMove\: TimeStamp expired: ([\d\.]+), CurrentTimeStamp: ([\d\.]+), Character: (.+)/;
            res = regex.exec(line);
            if (res) {
                data.incrementFrequencyCounter('serverMove', 0.05)

                const timestampExpired = +res[ 1 ];
                const currentTimeStamp = +res[ 2 ];
                const delta = currentTimeStamp - timestampExpired
                const playerName = pawnsToPlayerNames[ res[ 3 ] ];
                const playerController = playerNameToPlayerController[ playerName ]
                if (delta > 100) {
                    if (!serverMoveTimestampExpiredPerController[ playerController ]) {
                        console.log("Found sus player", playerName, res[ 3 ])
                        serverMoveTimestampExpiredPerController[ playerController ] = 0;
                    }
                    serverMoveTimestampExpiredPerController[ playerController ]++;
                }
                return;
            }

            regex = /Warning: UNetConnection::Tick/;
            res = regex.exec(line);
            if (res) {
                data.incrementFrequencyCounter('unetConnectionTick', 1)
                return;
            }

            regex = /SetReplicates called on non-initialized actor/;
            res = regex.exec(line);
            if (res) {
                data.incrementFrequencyCounter('nonInitializedActor', 1)
                return;
            }

            regex = /RotorWashEffectListener/;
            res = regex.exec(line);
            if (res) {
                data.incrementFrequencyCounter('rotorWashEffectListener', 1)
                return;
            }

            regex = /\[(.+)\]\[ ?(\d+)\].+Client netspeed is (\d+)/;
            res = regex.exec(line);
            if (res) {
                data.setNewCounterValue('clientNetSpeed', (+res[ 3 ]) / 1000)
                uniqueClientNetSpeedValues.add(+res[ 3 ]);
                const playerController = chainIdToPlayerController[ res[ 2 ] ]
                if (playerController) {
                    if (!playerControllerToNetspeed[ playerController ]) playerControllerToNetspeed[ playerController ] = []
                    playerControllerToNetspeed[ playerController ].push(+res[ 3 ])
                }
                return;
            }

            if (serverVersion < 7) {
                regex = /OnPossess\(\): PC=(.+) Pawn=(.+) FullPath/;
                res = regex.exec(line);
                if (res) {
                    pawnsToPlayerNames[ res[ 2 ] ] = res[ 1 ];
                }

                regex = /\[(.+)\]\[ ?(\d+)\]LogSquad: PostLogin: NewPlayer: [^ ]+PlayerController_C.+PersistentLevel\.(.+)/;
                res = regex.exec(line);
                if (res) {
                    chainIdToPlayerController[ res[ 2 ] ] = res[ 3 ];
                    connectionTimesByPlayerController[ res[ 3 ] ] = getDateTime(res[ 1 ])
                }
            } else {
                regex = /^\[([0-9.:-]+)]\[([ 0-9]*)]LogSquad: PostLogin: NewPlayer: BP_PlayerController_C .+PersistentLevel\.(.+) \(IP: ([\d\.]+) \| Online IDs: EOS: (.+) steam: (\d+)\)/;
                res = regex.exec(line);
                if (res) {
                    const playerController = res[ 3 ];

                    chainIdToPlayerController[ res[ 2 ] ] = playerController;
                    connectionTimesByPlayerController[ res[ 3 ] ] = getDateTime(res[ 1 ])

                    const steamID = res[ 6 ];
                    playerControllerToSteamID[ playerController ] = steamID;

                    const playerControllerHistory = steamIDToPlayerController.get(steamID);
                    if (!playerControllerHistory)
                        steamIDToPlayerController.set(steamID, [ playerController ]);
                    else
                        playerControllerHistory.push(playerController)
                }

                regex = /OnPossess\(\): PC=(.+) \(Online IDs: EOS: (.+) steam: (\d+)\) Pawn=(.+) FullPath/;
                res = regex.exec(line);
                if (res) {
                    pawnsToPlayerNames[ res[ 4 ] ] = res[ 1 ];
                }
            }

            regex = /\[.+\]\[ ?(\d+)\]LogSquad: Player (.+) has been added to Team/;
            res = regex.exec(line);
            if (res) {
                // data.incrementCounter('players', 1);
                playerNameToPlayerController[ res[ 2 ] ] = chainIdToPlayerController[ res[ 1 ] ];
                playerControllerToPlayerName[ chainIdToPlayerController[ res[ 1 ] ] ] = res[ 2 ];
                return;
            }
            regex = /\[(.+)\]\[ ?(\d+)\]LogNet: Join succeeded: (.+)/;
            res = regex.exec(line);
            if (res) {
                delete chainIdToPlayerController[ res[ 2 ] ];
                return;
            }

            regex = /\[.+\]\[ ?(\d+)\]LogEOS: \[Category: LogEOSAntiCheat\] \[AntiCheatServer\] \[RegisterClient-001\].+AccountId: (\d+) IpAddress/;
            res = regex.exec(line);
            if (res) {
                const playerController = chainIdToPlayerController[ res[ 1 ] ];

                if (playerController) {
                    const steamID = res[ 2 ];
                    playerControllerToSteamID[ playerController ] = steamID;

                    const playerControllerHistory = steamIDToPlayerController.get(steamID);
                    if (!playerControllerHistory)
                        steamIDToPlayerController.set(steamID, [ playerController ]);
                    else if (!playerControllerHistory.includes(playerController))
                        playerControllerHistory.push(playerController)
                }
                return;
            }

            regex = /Die\(\): Player:.+from (.+) caused by (.+)/;
            res = regex.exec(line);
            if (res) {
                data.incrementFrequencyCounter('playerDeaths', 1 / 5)
                let playerController = res[ 1 ]
                if (!playerController || playerController == 'nullptr') {
                    playerController = playerNameToPlayerController[ pawnsToPlayerNames[ res[ 2 ] ] ]
                }
                if (!killsPerPlayerController[ playerController ]) killsPerPlayerController[ playerController ] = 0;
                killsPerPlayerController[ playerController ]++;
                return;
            }

            regex = /LogSquadVoiceChannel: Warning: Unable to find channel for packet sender/;
            res = regex.exec(line);
            if (res) {
                data.incrementFrequencyCounter('unableToFindVoiceChannel', 0.005)
                return;
            }

            regex = /DealDamage was called but there was no valid actor or component/;
            res = regex.exec(line);
            if (res) {
                data.incrementFrequencyCounter('dealDamageOnInvalidActorOrComponent', 1)
                return;
            }

            regex = /TraceAndMessageClient\(\): SQVehicleSeat::TakeDamage/;
            res = regex.exec(line);
            if (res) {
                data.incrementFrequencyCounter('SQVehicleSeatTakeDamage', 1)
                return;
            }

            regex = /LogSquadCommon: SQCommonStatics Check Permissions/;
            res = regex.exec(line);
            if (res) {
                data.incrementFrequencyCounter('SQCommonStaticsCheckPermissions', 1)
                return;
            }

            regex = /Updated suppression multiplier/;
            res = regex.exec(line);
            if (res) {
                data.incrementFrequencyCounter('updatedSuppressionMultiplier', 1)
                return;
            }

            regex = /PlayerWounded_Implementation\(\): Driver Assist Points:/;
            res = regex.exec(line);
            if (res) {
                data.incrementFrequencyCounter('driverAssistPoints', 1)
                return;
            }
        })

        rl.on("close", () => {
            const endAnalysisTIme = Date.now();
            const serverUptimeMs = (+data.timePoints[ data.timePoints.length - 1 ].time - +data.timePoints[ 0 ].time)
            const serverUptimeHours = (serverUptimeMs / 1000 / 60 / 60).toFixed(1);

            let canvasWidth = Math.max(Math.min(serverUptimeMs / 15000, 30000), 4000);
            let canvasHeight = 2000;

            const chartCanvas = createCanvas(canvasWidth, canvasHeight);
            Chart.defaults.font.size = 40;

            // console.log(data.getCounterData('queue'))

            const chart = new Chart(chartCanvas, {
                type: "line",
                data: {
                    xLabels: data.getTimePoints(),
                    datasets: [
                        {
                            pointStyle: 'circle',
                            pointRadius: 0,
                            label: 'TickRate',
                            data: data.getCounterData('tickRate'),
                            fill: true,
                            backgroundColor: tpsColorGradientBackground,
                            borderColor: tpsColorGradient
                        },
                        {
                            pointStyle: 'circle',
                            pointRadius: 0,
                            label: 'Player Count',
                            data: data.getCounterData('players'),
                            backgroundColor: "#FF4466",
                            borderColor: "#FF4466"
                        },
                        {
                            pointStyle: 'circle',
                            pointRadius: 0,
                            label: 'Queue Count',
                            data: data.getCounterData('queue'),
                            backgroundColor: "#FF446666",
                            borderColor: "#FF446666"
                        },
                        {
                            pointStyle: 'circle',
                            pointRadius: 0,
                            label: 'HostClosedConnection*3',
                            data: data.getCounterData('hostClosedConnection'),
                            backgroundColor: "#d87402",
                            borderColor: "#d87402"
                        },
                        {
                            pointStyle: 'circle',
                            pointRadius: 0,
                            label: 'Failed Queue Connections*3',
                            data: data.getCounterData('queueDisconnections'),
                            backgroundColor: "#b5ac4f",
                            borderColor: "#b5ac4f"
                        },
                        {
                            type: 'bar',
                            label: 'Layers',
                            data: data.getCounterData('layers'),
                            barThickness: 5,
                            borderSkipped: false,
                            backgroundColor: "#FFFFFF22",
                            borderColor: "#FFFFFF22"
                        },
                        {
                            pointStyle: 'circle',
                            pointRadius: 0,
                            label: 'ClientNetSpeed/1000',
                            data: data.getCounterData('clientNetSpeed'),
                            backgroundColor: "#397060",
                            borderColor: "#397060"
                        },
                        {
                            pointStyle: 'circle',
                            pointRadius: 0,
                            label: 'Explosions',
                            data: data.getCounterData('frags'),
                            backgroundColor: "#ba01ba",
                            borderColor: "#ba01ba"
                        },
                        {
                            pointStyle: 'circle',
                            pointRadius: 0,
                            label: 'ServerMoveTSExp/20',
                            data: data.getCounterData('serverMove'),
                            backgroundColor: "#8888FF",
                            borderColor: "#8888FF"
                        },
                        {
                            pointStyle: 'circle',
                            pointRadius: 0,
                            label: 'UNetConnectionTick',
                            data: data.getCounterData('unetConnectionTick'),
                            backgroundColor: "#3b0187",
                            borderColor: "#3b0187"
                        },
                        {
                            pointStyle: 'circle',
                            pointRadius: 0,
                            label: 'Non-Initialized Actors',
                            data: data.getCounterData('nonInitializedActor'),
                            backgroundColor: "#460470",
                            borderColor: "#460470"
                        },
                        {
                            pointStyle: 'circle',
                            pointRadius: 0,
                            label: 'RotorWashEffectListener',
                            data: data.getCounterData('rotorWashEffectListener'),
                            backgroundColor: "#68bf3d",
                            borderColor: "#68bf3d"
                        },
                        {
                            pointStyle: 'circle',
                            pointRadius: 0,
                            label: 'Deaths/5',
                            data: data.getCounterData('playerDeaths'),
                            backgroundColor: "#bc0303",
                            borderColor: "#bc0303"
                        },
                        // {
                        //     pointStyle: 'circle',
                        //     pointRadius: 0,
                        //     label: 'UnableToFindVoiceChannel/200',
                        //     data: data.getCounterData('unableToFindVoiceChannel'),
                        //     backgroundColor: "#ffff00",
                        //     borderColor: "#ffff00"
                        // }
                    ]
                },
                options: {
                    layout: {
                        padding: {
                            left: 200,
                            right: 50,
                            top: 150,
                            bottom: 100
                        }
                    },
                    scales: {
                        x: {
                            min: 0,
                            max: data.timePoints.length,
                            grid: {
                                lineWidth: 0
                            }
                        },
                        y: {
                            min: 0,
                            max: Math.max(100, maxQueue),
                            ticks: {
                                stepSize: 5
                            },
                            grid: {
                                lineWidth: 0
                            }
                        }
                    }
                },
                plugins: [
                    chartBackgroundPlugin(!!+process.env.ENABLE_TPS_BACKGROUND),
                    layerTextPlugin(),
                    serverNamePlugin(serverName),
                    serverVersionPlugin(serverVersion, canvasWidth, canvasHeight),
                    serverCPUPlugin(serverCPU, canvasWidth, canvasHeight)
                ]
            });

            const endTime = Date.now();
            const analysisDuration = ((endAnalysisTIme - startTime) / 1000).toFixed(1)
            const totalDuration = ((endTime - startTime) / 1000).toFixed(1)

            console.log(`\n\x1b[1m\x1b[34m### SERVER STAT REPORT: \x1b[32m${fileNameNoExt}\x1b[34m ###\x1b[0m`)
            console.log(`\x1b[1m\x1b[34m#\x1b[0m == \x1b[1m\x1b[31mServer Name:\x1b[0m ${serverName}`)
            console.log(`\x1b[1m\x1b[34m#\x1b[0m == \x1b[1m\x1b[31mServer CPU:\x1b[0m ${serverCPU}`)
            console.log(`\x1b[1m\x1b[34m#\x1b[0m == \x1b[1m\x1b[31mSquad Version:\x1b[0m ${serverVersion}`)
            console.log(`\x1b[1m\x1b[34m#\x1b[0m == \x1b[1m\x1b[31mServer Uptime:\x1b[0m ${serverUptimeHours} h`)
            console.log(`\x1b[1m\x1b[34m#\x1b[0m == \x1b[1m\x1b[31mHost Closed Connections:\x1b[0m ${data.getCounterData('hostClosedConnection').map(e => e.y / 3).reduce((acc, curr) => acc + curr, 0)}`)
            console.log(`\x1b[1m\x1b[34m#\x1b[0m == \x1b[1m\x1b[31mFailed Queue Connections:\x1b[0m ${data.getCounterData('queueDisconnections').map(e => e.y / 3).reduce((acc, curr) => acc + curr, 0)}`)
            console.log(`\x1b[1m\x1b[34m#\x1b[0m == \x1b[1m\x1b[31mSteam Empty Tickets:\x1b[0m ${data.getCounterData('steamEmptyTicket').map(e => e.y).reduce((acc, curr) => acc + curr, 0)}`)
            console.log(`\x1b[1m\x1b[34m#\x1b[0m == \x1b[1m\x1b[31mUnique Client NetSpeed Values:\x1b[0m ${[ ...uniqueClientNetSpeedValues.values() ].join('; ')}`)
            console.log(`\x1b[1m\x1b[34m#\x1b[0m == \x1b[1m\x1b[31mAnalysis duration:\x1b[0m ${analysisDuration}`)
            console.log(`\x1b[1m\x1b[34m#\x1b[0m == \x1b[1m\x1b[31mTotal duration:\x1b[0m ${totalDuration}`)
            console.log(`\x1b[1m\x1b[34m### CHEATING REPORT: \x1b[32m${fileNameNoExt}\x1b[34m ###\x1b[0m`)
            const cheaters = {
                Explosions: explosionCountersPerController,
                ServerMoveTimeStampExpired: serverMoveTimestampExpiredPerController,
                // ClientNetSpeed: playerControllerToNetspeed
                // Kills: killsPerPlayerController
            }

            let suspectedCheaters = [];
            for (let cK in cheaters) {
                let minCount = 200;
                switch (cK) {
                    case 'Explosions':
                        minCount = 200;
                        break;
                    case 'ServerMoveTimeStampExpired':
                        minCount = 3000;
                        break;
                    case 'Kills':
                        minCount = 100;
                        break;
                    case 'ClientNetSpeed':
                        minCount = 1800;
                        break;
                }

                console.log(`\x1b[1m\x1b[34m#\x1b[0m == \x1b[1m\x1b[31m${cK.toUpperCase()}\x1b[0m`)
                for (let playerId in cheaters[ cK ]) {
                    const referenceValue = cheaters[ cK ][ playerId ]
                    if ((typeof referenceValue === "number" && referenceValue > minCount) || (typeof referenceValue === "object" && referenceValue.find(v => v > minCount))) {
                        let playerName;
                        let playerSteamID;
                        let playerController;

                        playerController = playerId
                        playerName = playerControllerToPlayerName[ playerController ];
                        playerSteamID = playerControllerToSteamID[ playerController ];

                        suspectedCheaters.push(playerSteamID);

                        console.log(`\x1b[1m\x1b[34m#\x1b[0m  > \x1b[33m${playerSteamID}\x1b[90m ${playerController}\x1b[37m ${playerName}\x1b[90m: \x1b[91m${cheaters[ cK ][ playerId ]}\x1b[0m`)
                    }
                }
            }
            console.log(`\x1b[1m\x1b[34m### SUSPECTED CHEATERS SESSIONS: \x1b[32m${fileNameNoExt}\x1b[34m ###\x1b[0m`)
            for (let playerSteamID of suspectedCheaters) {
                const playerControllerHistory = steamIDToPlayerController.get(playerSteamID);
                if (!playerControllerHistory) continue;
                let playerName = playerControllerToPlayerName[ playerControllerHistory[ 0 ] ];
                console.log(`\x1b[1m\x1b[34m#\x1b[0m == \x1b[1m\x1b[33m${playerSteamID} \x1b[31m${playerName}\x1b[0m`)

                for (let playerController of playerControllerHistory) {
                    let stringifiedConnectionTime = connectionTimesByPlayerController[ playerController ].toLocaleString();
                    let stringifiedDisconnectionTime = disconnectionTimesByPlayerController[ playerController ]?.toLocaleString() || "N/A"

                    console.log(`\x1b[1m\x1b[34m#\x1b[0m  > \x1b[90m ${playerController}\x1b[90m: \x1b[91m(${stringifiedConnectionTime} - ${stringifiedDisconnectionTime})\x1b[0m`)
                }
            }
            console.log(`\x1b[1m\x1b[34m#### FINISHED ALL REPORTS: \x1b[32m${fileNameNoExt}\x1b[34m ###\x1b[0m`)

            resolve(chartCanvas);
        })

        rl.on('error', (err) => {
            reject(err);
        });
    });
}

function getDateTime(date) {
    const parts = date.replace(/:\d+$/, '').replace(/-/, 'T').split('T');
    parts[ 0 ] = parts[ 0 ].replace(/\./g, '-')
    parts[ 1 ] = parts[ 1 ].replace(/\./g, ':')
    const res = `${parts.join('T')}Z`;
    return new Date(res)
}

main();