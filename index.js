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

        const graph = await drawGraph(logPath, fileNameNoExt)

        fs.writeFileSync(outputPath, graph.toBuffer("image/png"))
    })

    await Promise.all(filesToAnalyze);
}

function drawGraph(logPath /*string*/, fileNameNoExt) {
    return new Promise((resolve, reject) => {
        const data = new DataStore();

        let serverName = '';
        let serverVersion = '';
        let serverCPU = '';

        let maxQueue = 0;

        let uniqueClientNetSpeedValues = new Set();

        let explosionCountersPerController = []
        let serverMoveTimestampExpiredPerPawn = []
        let pawnsToPlayerNames = []
        let chainIdToPlayerController = []
        let playerNameToPlayerController = []
        let playerControllerToPlayerName = []
        let playerControllerToSteamID = []
        let killsPerPlayerController = []


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
                const timePoint = getDateTime(res[ 1 ]).toLocaleString();
                data.addTimePoint(timePoint);

                data.setNewCounterValue('queueDisconnections', 0)
                data.setNewCounterValue('hostClosedConnection', 0)
                data.setNewCounterValue('frags', 0)
                data.setNewCounterValue('serverMove', 0)
                data.setNewCounterValue('steamEmptyTicket', 0)

                data.setNewCounterValue('tickRate', Math.round(+res[ 2 ]))
            }

            regex = / ServerName: \'(.+)\' RegisterTimeout:/
            res = regex.exec(line);
            if (res) {
                serverName = res[ 1 ];
            }

            regex = /LogInit: OS: .+, CPU: (.+), GPU:/
            res = regex.exec(line);
            if (res) {
                serverCPU = res[ 1 ];
            }

            regex = /LogNetVersion: Set ProjectVersion to (V.+)\. Version/
            res = regex.exec(line);
            if (res) {
                serverVersion = res[ 1 ];
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
                data.incrementCounterLast('queueDisconnections', 3);
            }
            regex = /LogOnline: Warning: STEAM: AUTH: Ticket from user .+ is empty/;
            res = regex.exec(line);
            if (res) {
                // steamEmptyTicket[ steamEmptyTicket.length - 1 ].y += 1;
                data.incrementCounter('steamEmptyTicket', 1)
            }

            regex = /CloseBunch/
            res = regex.exec(line);
            if (res) {
                // queuePoints[ queuePoints.length - 1 ].y -= 1;
                data.incrementCounter('queue', -1)
            }

            regex = /LogSquad: PostLogin: NewPlayer: [^ ]+PlayerController_C/;
            res = regex.exec(line);
            if (res) {
                data.incrementCounter('players', 1);
                playerNameToPlayerController[ res[ 2 ] ] = chainIdToPlayerController[ res[ 1 ] ];
                playerControllerToPlayerName[ chainIdToPlayerController[ res[ 1 ] ] ] = res[ 2 ];
            }

            regex = /^\[([0-9.:-]+)]\[([ 0-9]*)]LogNet: UChannel::Close: Sending CloseBunch\. ChIndex == [0-9]+\. Name: \[UChannel\] ChIndex: [0-9]+, Closing: [0-9]+ \[UNetConnection\] RemoteAddr: (.+):[0-9]+, Name: (Steam|EOSIp)NetConnection_[0-9]+, Driver: GameNetDriver (Steam|EOS)NetDriver_[0-9]+, IsServer: YES, PC: ([^ ]+PlayerController_C_[0-9]+), Owner: [^ ]+PlayerController_C_[0-9]+/
            res = regex.exec(line);
            if (res) {
                data.incrementCounter('players', -1);
            }

            regex = /LogOnlineGame: Display: Kicking player: .+ ; Reason = Host closed the connection/;
            res = regex.exec(line);
            if (res) {
                data.incrementCounterLast('hostClosedConnection', 3)
            }

            regex = /\[(.+)\].+LogSquad: OnPreLoadMap: Loading map .+\/([^\/]+)$/;
            res = regex.exec(line);
            if (res) {
                const timePoint = getDateTime(res[ 1 ]).toLocaleString();
                data.setNewCounterValue('layers', 150, res[ 2 ], timePoint)
            }

            regex = /\[(.+)\]\[\d+].*LogWorld: SeamlessTravel to: .+\/([^\/]+)$/;
            res = regex.exec(line);
            if (res) {
                data.setNewCounterValue('layers', 150, res[ 2 ])
            }

            regex = /Frag_C.*DamageInstigator=(BP_PlayerController_C_\d+) /;
            res = regex.exec(line);
            if (res) {
                data.incrementCounterLast('frags', 1)

                const playerController = res[ 1 ];
                if (!explosionCountersPerController[ playerController ]) explosionCountersPerController[ playerController ] = 0;
                explosionCountersPerController[ playerController ]++;
            }

            regex = /ServerMove\: TimeStamp expired.+Character: (.+)/;
            res = regex.exec(line);
            if (res) {
                data.incrementCounterLast('serverMove', 0.05)

                const playerName = pawnsToPlayerNames[ res[ 1 ] ];
                const playerController = playerNameToPlayerController[ playerName ]
                if (!serverMoveTimestampExpiredPerPawn[ playerController ]) serverMoveTimestampExpiredPerPawn[ playerController ] = 0;
                serverMoveTimestampExpiredPerPawn[ playerController ]++;
            }

            regex = /Client netspeed is (\d+)/;
            res = regex.exec(line);
            if (res) {
                data.setNewCounterValue('clientNetSpeed', (+res[ 1 ]) / 1000)
                uniqueClientNetSpeedValues.add(+res[ 1 ]);
            }

            regex = /OnPossess\(\): PC=(.+) Pawn=(.+) FullPath/;
            res = regex.exec(line);
            if (res) {
                pawnsToPlayerNames[ res[ 2 ] ] = res[ 1 ];
            }

            regex = /\[.+\]\[ ?(\d+)\]LogSquad: PostLogin: NewPlayer: BP_PlayerController_C.+PersistentLevel\.(.+)/;
            res = regex.exec(line);
            if (res) {
                chainIdToPlayerController[ res[ 1 ] ] = res[ 2 ];
            }

            regex = /\[.+\]\[ ?(\d+)\]LogEOS: \[Category: LogEOSAntiCheat\] \[AntiCheatServer\] \[RegisterClient-001\].+AccountId: (\d+) IpAddress/;
            res = regex.exec(line);
            if (res) {
                playerControllerToSteamID[ chainIdToPlayerController[ res[ 1 ] ] ] = res[ 2 ];
            }

            regex = /Die\(\): Player:.+from (.+) caused by (.+)/;
            res = regex.exec(line);
            if (res) {
                let playerController = res[ 1 ]
                if (!playerController || playerController == 'nullptr') {
                    playerController = playerNameToPlayerController[ pawnsToPlayerNames[ res[ 2 ] ] ]
                }
                if (!killsPerPlayerController[ playerController ]) killsPerPlayerController[ playerController ] = 0;
                killsPerPlayerController[ playerController ]++;
            }
        })

        rl.on("close", () => {
            console.log(`\n\x1b[1m\x1b[34m### SERVER STAT REPORT: \x1b[32m${fileNameNoExt}\x1b[34m ###\x1b[0m`)
            console.log(`\x1b[1m\x1b[34m#\x1b[0m == \x1b[1m\x1b[31mHost Closed Connections:\x1b[0m ${data.getCounterData('hostClosedConnection').map(e => e.y / 3).reduce((acc, curr) => acc + curr, 0)}`)
            console.log(`\x1b[1m\x1b[34m#\x1b[0m == \x1b[1m\x1b[31mFailed Queue Connections:\x1b[0m ${data.getCounterData('queueDisconnections').map(e => e.y / 3).reduce((acc, curr) => acc + curr, 0)}`)
            console.log(`\x1b[1m\x1b[34m#\x1b[0m == \x1b[1m\x1b[31mSteam Empty Tickets:\x1b[0m ${data.getCounterData('steamEmptyTicket').map(e => e.y).reduce((acc, curr) => acc + curr, 0)}`)
            console.log(`\x1b[1m\x1b[34m#\x1b[0m == \x1b[1m\x1b[31mUnique Client NetSpeed Values:\x1b[0m ${[ ...uniqueClientNetSpeedValues.values() ].join('; ')}`)
            console.log(`\x1b[1m\x1b[34m### STARTING CHEATING REPORT: \x1b[32m${fileNameNoExt}\x1b[34m ###\x1b[0m`)
            const cheaters = {
                Explosions: explosionCountersPerController,
                ServerMoveTimeStampExpired: serverMoveTimestampExpiredPerPawn,
                Kills: killsPerPlayerController
            }

            for (let cK in cheaters) {
                let minCount = 200;
                switch (cK) {
                    case 'Explosions':
                        minCount = 200;
                        break;
                    case 'ServerMoveTimeStampExpired':
                        minCount = 5000;
                        break;
                    case 'Kills':
                        minCount = 100;
                        break;
                }

                console.log(`\x1b[1m\x1b[34m#\x1b[0m == \x1b[1m\x1b[31m${cK.toUpperCase()}\x1b[0m`)
                for (let playerId in cheaters[ cK ])
                    if (cheaters[ cK ][ playerId ] > minCount) {
                        let playerName;
                        let playerSteamID;
                        let playerController;

                        playerController = playerId
                        playerName = playerControllerToPlayerName[ playerController ];
                        playerSteamID = playerControllerToSteamID[ playerController ]

                        console.log(`\x1b[1m\x1b[34m#\x1b[0m  > \x1b[33m${playerSteamID}\x1b[90m ${playerController}\x1b[37m ${playerName}\x1b[90m: \x1b[91m${cheaters[ cK ][ playerId ]}\x1b[0m`)
                    }
            }
            console.log(`\x1b[1m\x1b[34m#### FINISHED ALL REPORTS: \x1b[32m${fileNameNoExt}\x1b[34m ###\x1b[0m`)

            let canvasWidth = Math.max(Math.min(totalLines / 120, 30000), 4000);
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
                            borderWidth: {
                                right: "100px",
                            },
                            borderSkipped: false,
                            backgroundColor: "#FFFFFF22",
                            borderColor: "#FFFFFF22"
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
                            label: 'ClientNetSpeed/1000',
                            data: data.getCounterData('clientNetSpeed'),
                            backgroundColor: "#397060",
                            borderColor: "#397060"
                        },
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