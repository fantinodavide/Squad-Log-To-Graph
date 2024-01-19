import Chart from 'chart.js/auto';
import { createCanvas, loadImage } from 'canvas';
import fs from 'fs';
import path from 'path';
import 'dotenv/config'
import readline from 'readline';

import DataStore from './services/data-store.js';
import Analyzer from './services/analyzer.js';

import serverNamePlugin from './chart-plugins/server-name.js';
import chartBackgroundPlugin from './chart-plugins/chart-background.js';
import layerTextPlugin from './chart-plugins/layer-text.js';
import serverVersionPlugin from './chart-plugins/server-version.js';
import serverCPUPlugin from './chart-plugins/server-cpu.js';

import tpsColorGradient from './chart-functions/tps-color-gradient.js';
import tpsColorGradientBackground from './chart-functions/tps-color-gradient-background.js';

const INPUT_DIR = 'input-logs';
const OUPUT_DIR = 'output-graphs';

const options = {
    ENABLE_TSEXPIRED_DELTA_CHECK: true,
    PLAYER_CONTROLLER_FILTER: "" // To move to a better place. Set to a real player controller value like BP_PlayerController_C_2146648925 to filter the graph (partially implemented)
}

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
    return new Promise(async (resolve, reject) => {
        const fileStream = fs.createReadStream(logPath);
        const rl = readline.createInterface({
            input: fileStream,
            crlfDelay: Infinity,
        });

        const data = new DataStore();
        const analyzer = new Analyzer(data, options);

        analyzer.on("close", (data) => {
            if (!data.getVar('ServerName'))
                data.setVar('ServerName', fileNameNoExt)

            const serverUptimeMs = (+data.timePoints[ data.timePoints.length - 1 ].time - +data.timePoints[ 0 ].time)
            const serverUptimeHours = (serverUptimeMs / 1000 / 60 / 60).toFixed(1);

            let canvasWidth = Math.max(Math.min(serverUptimeMs / 15000, 30000), 4000);
            let canvasHeight = 2000;

            const chartCanvas = createCanvas(canvasWidth, canvasHeight);
            Chart.defaults.font.size = 40;

            const chart = new Chart(chartCanvas, {
                type: "line",
                data: {
                    xLabels: data.getTimePoints(),
                    datasets: [
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
                            label: 'Spawned Player Count',
                            data: data.getCounterData('SpawnedCount'),
                            backgroundColor: "#FF226666",
                            borderColor: "#FF226666"
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
                            label: 'Kills/5',
                            data: data.getCounterData('PlayerKills'),
                            backgroundColor: "#bc0303",
                            borderColor: "#bc0303"
                        },
                        {
                            pointStyle: 'circle',
                            pointRadius: 0,
                            label: 'KnifeWouds',
                            data: data.getCounterData('PlayerKnifeWounds'),
                            backgroundColor: "#ff0000",
                            borderColor: "#ff0000"
                        },
                        {
                            pointStyle: 'circle',
                            pointRadius: 0,
                            label: 'AcceptedConnection/1000',
                            data: data.getCounterData('AcceptedConnection'),
                            backgroundColor: "#ffff00",
                            borderColor: "#ffff00"
                        },
                        {
                            pointStyle: 'circle',
                            pointRadius: 0,
                            label: 'RadioHits/10',
                            data: data.getCounterData('RadioHits'),
                            backgroundColor: "#33aa00",
                            borderColor: "#33aa00"
                        },
                        // {
                        //     pointStyle: 'circle',
                        //     pointRadius: 0,
                        //     label: 'FoliageInstancedStaticMeshComponent/10',
                        //     data: data.getCounterData('FoliageInstancedStaticMeshComponent'),
                        //     backgroundColor: "#449922",
                        //     borderColor: "#449922"
                        // },
                        {
                            pointStyle: 'circle',
                            pointRadius: 0,
                            label: 'UnableToFindVoiceChannel/200',
                            data: data.getCounterData('unableToFindVoiceChannel'),
                            backgroundColor: "#ffff00",
                            borderColor: "#ffff00"
                        }
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
                            max: Math.max(100, data.getVar('MaxQueue')),
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
                    serverNamePlugin(data.getVar('ServerName')),
                    serverVersionPlugin(data.getVar('ServerVersion'), canvasWidth, canvasHeight),
                    serverCPUPlugin(data.getVar('ServerCPU'), canvasWidth, canvasHeight)
                ]
            });

            const startTime = data.getVar('AnalysisStartTime')
            const totalEndTime = Date.now();
            data.setVar('TotalEndTime', totalEndTime)
            const analysisDuration = data.getVar('AnalysisDuration')

            const totalDurationMs = totalEndTime - startTime
            const totalDuration = (totalDurationMs / 1000).toFixed(1)
            data.setVar('TotalDurationMs', totalDurationMs)
            data.setVar('TotalDuration', totalDuration)

            const liveTime = (data.getVar('ServerLiveTime') / 1000 / 60 / 60).toFixed(1);
            const seedingTime = (data.getVar('ServerSeedingTime') / 1000 / 60 / 60).toFixed(1);

            console.log(`\n\x1b[1m\x1b[34m### SERVER STAT REPORT: \x1b[32m${fileNameNoExt}\x1b[34m ###\x1b[0m`)
            console.log(`\x1b[1m\x1b[34m#\x1b[0m == \x1b[1m\x1b[31mServer Name:\x1b[0m ${data.getVar('ServerName')}`)
            console.log(`\x1b[1m\x1b[34m#\x1b[0m == \x1b[1m\x1b[31mServer CPU:\x1b[0m ${data.getVar('ServerCPU')}`)
            console.log(`\x1b[1m\x1b[34m#\x1b[0m == \x1b[1m\x1b[31mServer OS:\x1b[0m ${data.getVar('ServerOS')}`)
            console.log(`\x1b[1m\x1b[34m#\x1b[0m == \x1b[1m\x1b[31mSquad Version:\x1b[0m ${data.getVar('ServerVersion')}`)
            console.log(`\x1b[1m\x1b[34m#\x1b[0m == \x1b[1m\x1b[31mServer Uptime:\x1b[0m ${serverUptimeHours} h`)
            console.log(`\x1b[1m\x1b[34m#\x1b[0m == \x1b[1m\x1b[31mServer Live Time:\x1b[0m ${liveTime} h`)
            console.log(`\x1b[1m\x1b[34m#\x1b[0m == \x1b[1m\x1b[31mServer Seeding Time:\x1b[0m ${seedingTime} h`)
            console.log(`\x1b[1m\x1b[34m#\x1b[0m == \x1b[1m\x1b[31mHost Closed Connections:\x1b[0m ${data.getCounterData('hostClosedConnection').map(e => e.y / 3).reduce((acc, curr) => acc + curr, 0)}`)
            console.log(`\x1b[1m\x1b[34m#\x1b[0m == \x1b[1m\x1b[31mFailed Queue Connections:\x1b[0m ${data.getCounterData('queueDisconnections').map(e => e.y / 3).reduce((acc, curr) => acc + curr, 0)}`)
            console.log(`\x1b[1m\x1b[34m#\x1b[0m == \x1b[1m\x1b[31mSteam Empty Tickets:\x1b[0m ${data.getCounterData('steamEmptyTicket').map(e => e.y).reduce((acc, curr) => acc + curr, 0)}`)
            console.log(`\x1b[1m\x1b[34m#\x1b[0m == \x1b[1m\x1b[31mUnique Client NetSpeed Values:\x1b[0m ${[ ...data.getVar('UniqueClientNetSpeedValues').values() ].join('; ')}`)
            console.log(`\x1b[1m\x1b[34m#\x1b[0m == \x1b[1m\x1b[31mAccepted Connection Lines:\x1b[0m ${data.getCounterData('AcceptedConnection').map(e => Math.round(e.y * 1000)).reduce((acc, curr) => acc + curr, 0)}`)
            console.log(`\x1b[1m\x1b[34m#\x1b[0m == \x1b[1m\x1b[31mAnalysis duration:\x1b[0m ${analysisDuration} s`)
            console.log(`\x1b[1m\x1b[34m#\x1b[0m == \x1b[1m\x1b[31mTotal duration:\x1b[0m ${totalDuration} s`)
            console.log(`\x1b[1m\x1b[34m### CHEATING REPORT: \x1b[32m${fileNameNoExt}\x1b[34m ###\x1b[0m`)
            const cheaters = {
                Explosions: data.getVar('explosionCountersPerController'),
                ServerMoveTimeStampExpired: data.getVar('serverMoveTimestampExpiredPerController'),
                KnifeWounds: data.getVar('knifeWoundsPerPlayerController'),
                // ClientNetSpeed: playerControllerToNetspeed
                // Kills: killsPerPlayerController
            }

            let suspectedCheaters = new Set();
            for (let cK in cheaters) {
                let minCount = 200;
                switch (cK) {
                    case 'Explosions':
                        minCount = 200;
                        break;
                    case 'ServerMoveTimeStampExpired':
                        minCount = 3000;
                        break;
                    case 'KnifeWounds':
                        minCount = 15;
                        break;
                    case 'Kills':
                        minCount = 100;
                        break;
                    case 'ClientNetSpeed':
                        minCount = 18000;
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
                        const playerControllerToPlayerName = data.getVar('playerControllerToPlayerName')
                        const playerControllerToSteamID = data.getVar('playerControllerToSteamID')
                        playerName = playerControllerToPlayerName[ playerController ];
                        playerSteamID = playerControllerToSteamID[ playerController ];

                        suspectedCheaters.add(playerSteamID);

                        console.log(`\x1b[1m\x1b[34m#\x1b[0m  > \x1b[33m${playerSteamID}\x1b[90m ${playerController}\x1b[37m ${playerName}\x1b[90m: \x1b[91m${cheaters[ cK ][ playerId ]}\x1b[0m`)
                    }
                }
            }
            console.log(`\x1b[1m\x1b[34m### SUSPECTED CHEATERS SESSIONS: \x1b[32m${fileNameNoExt}\x1b[34m ###\x1b[0m`)
            for (let playerSteamID of suspectedCheaters) {
                const disconnectionTimesByPlayerController = data.getVar('disconnectionTimesByPlayerController')
                const connectionTimesByPlayerController = data.getVar('connectionTimesByPlayerController')
                const explosionCountersPerController = data.getVar('explosionCountersPerController')
                const serverMoveTimestampExpiredPerController = data.getVar('serverMoveTimestampExpiredPerController')
                const killsPerPlayerController = data.getVar('killsPerPlayerController')
                const knifeWoundsPerPlayerController = data.getVar('knifeWoundsPerPlayerController')
                const steamIDToPlayerController = data.getVar('steamIDToPlayerController')
                const playerControllerHistory = steamIDToPlayerController.get(playerSteamID);
                if (!playerControllerHistory) continue;
                const playerControllerToPlayerName = data.getVar('playerControllerToPlayerName')
                let playerName = playerControllerToPlayerName[ playerControllerHistory[ 0 ] ];
                console.log(`\x1b[1m\x1b[34m#\x1b[0m == \x1b[1m\x1b[33m${playerSteamID} \x1b[31m${playerName}\x1b[0m`)

                for (let playerController of playerControllerHistory) {
                    let stringifiedConnectionTime = connectionTimesByPlayerController[ playerController ].toLocaleString();
                    let stringifiedDisconnectionTime = disconnectionTimesByPlayerController[ playerController ]?.toLocaleString() || "N/A"

                    console.log(`\x1b[1m\x1b[34m#\x1b[0m  > \x1b[90m ${playerController}\x1b[90m: \x1b[37m(${stringifiedConnectionTime} - ${stringifiedDisconnectionTime})\x1b[90m`)
                }
            }

            const unidentifiedPawns = data.getVar('UnidentifiedPawns');
            if (unidentifiedPawns?.size > 0) {
                console.log(`\x1b[1m\x1b[34m### UNIDENTIFIED PAWNS: \x1b[32m${fileNameNoExt}\x1b[34m ###\x1b[0m`)
                for (let pawn of unidentifiedPawns) {
                    console.log(`\x1b[ 1m\x1b[ 34m#\x1b[ 0m == \x1b[ 1m${pawn} \x1b[ 0m`)
                }
            }
            console.log(`\x1b[1m\x1b[34m### FINISHED ALL REPORTS: \x1b[32m${fileNameNoExt}\x1b[34m ###\x1b[0m`)

            resolve(chartCanvas);
        })

        rl.on('line', (line) => {
            analyzer.emit('line', line)
        })

        rl.on('close', () => {
            analyzer.close();
        })
        rl.on('error', (err) => {
            reject(err);
        });

        await analyzer.analyze();
    });
}

main();