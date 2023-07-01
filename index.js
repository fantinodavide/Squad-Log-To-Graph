// import { Chart, controllers, registerables } from "chart.js";
import Chart from 'chart.js/auto';
import { createCanvas, loadImage } from 'canvas';
import fs from 'fs';
import path from 'path';

const INPUT_DIR = 'input-logs';
const OUPUT_DIR = 'output-graphs';

async function main() {
    const files = fs.readdirSync(INPUT_DIR).filter(f => f.endsWith('.log'));
    console.log(`Logs found (${files.length}):\n > ${files.join(`\n > `)}`);

    if (!fs.existsSync(INPUT_DIR)) fs.mkdirSync(INPUT_DIR)
    if (!fs.existsSync(OUPUT_DIR)) fs.mkdirSync(OUPUT_DIR)

    for (let logFile of files) {
        const logPath = path.join(INPUT_DIR, logFile);
        const fileNameNoExt = logFile.replace(/\.[^\.]+$/, '');
        const outputPath = path.join(OUPUT_DIR, `${fileNameNoExt}.png`)

        const logs = fs.readFileSync(logPath).toString();
        const graph = drawGraph(logs, fileNameNoExt)

        fs.writeFileSync(outputPath, graph.toBuffer("image/png"))
    }
}

function drawGraph(logs /*string*/, fileNameNoExt) {
    let serverName = '';
    let chartPoints = [];
    let queuePoints = [ {
        x: 0,
        y: 0
    } ];
    let playerPoints = [ {
        x: 0,
        y: 0
    } ];
    let hostClosedConnectionPoints = [ {
        x: 0,
        y: 0
    } ];
    let serverMovePoints = [ {
        x: 0,
        y: 0
    } ];
    let fragPoints = [ {
        x: 0,
        y: 0
    } ];
    let maxQueue = 0;
    let layers = []

    let explosionCountersPerController = []
    let serverMoveTimestampExpiredPerPawn = []
    let pawnsToPlayerNames = []
    let chainIdToPlayerController = []
    let playerNameToPlayerController = []
    let playerControllerToPlayerName = []
    let playerControllerToSteamID = []
    let killsPerPlayerController = []

    const splitLogs = logs.split('\n');
    for (let lI in splitLogs) {
        const line = splitLogs[ lI ];
        // if (lI > 250000) continue;

        let regex, res;
        regex = /\[(.+)\]\[\d+]LogSquad: .+: Server Tick Rate: (\d+.?\d+)/;
        res = regex.exec(line);
        if (res) {
            const obj = {
                x: getDateTime(res[ 1 ]).toLocaleString(),
                y: Math.round(+res[ 2 ])
            }
            chartPoints.push(obj)
            if (layers[ 0 ] && layers[ 0 ].x == 0) layers[ 0 ].x = obj.x
            playerPoints.push({
                x: obj.x,
                y: playerPoints[ playerPoints.length - 1 ].y
            })
            queuePoints.push({
                x: obj.x,
                y: queuePoints[ queuePoints.length - 1 ].y
            })
            hostClosedConnectionPoints.push({
                x: obj.x,
                y: 0
            })
            fragPoints.push({
                x: obj.x,
                y: 0
            })
            serverMovePoints.push({
                x: obj.x,
                y: 0
            })

            // console.log('TPS', obj);
            continue;
        }

        regex = / ServerName: \'(.+)\' RegisterTimeout:/
        res = regex.exec(line);
        if (res) {
            serverName = res[ 1 ];
            // continue;
        }

        regex = /NotifyAcceptingChannel/
        res = regex.exec(line);
        if (res) {
            queuePoints[ queuePoints.length - 1 ].y += 1;
            if (queuePoints[ queuePoints.length - 1 ].y > maxQueue) maxQueue = queuePoints[ queuePoints.length - 1 ].y;
            continue;
        }

        regex = /CloseBunch/
        res = regex.exec(line);
        if (res) {
            queuePoints[ queuePoints.length - 1 ].y -= 1;
            // continue;
        }


        regex = /\[.+\]\[ ?(\d+)\]LogNet: Join succeeded: (.+)/;
        // regex = /LogNet: Client netspeed is/;
        res = regex.exec(line);
        // console.log(res);
        if (res) {
            playerPoints[ playerPoints.length - 1 ].y += 1;
            playerNameToPlayerController[ res[ 2 ] ] = chainIdToPlayerController[ res[ 1 ] ];
            playerControllerToPlayerName[ chainIdToPlayerController[ res[ 1 ] ] ] = res[ 2 ];
            // queuePoints[ queuePoints.length - 1 ].y -= 1;
            // console.log(playerPoints[ playerPoints.length - 1 ].y)
            continue;
        }

        // regex = /LogNet: UNetConnection::Close: \[UNetConnection\] RemoteAddr: .+, Name: .+, Driver: GameNetDriver .+, IsServer: YES, PC: (.+), Owner: .+/;
        // regex = /LogOnline: STEAM: \d+ has been removed/;
        regex = /LogNet: UChannel::Close: Sending CloseBunch\. ChIndex == \d\. Name: \[UChannel\] ChIndex: \d, Closing: \d \[UNetConnection\] RemoteAddr: \d+\:\d+, Name: .+, Driver: .+, IsServer: YES, PC:.+Player.+/;
        res = regex.exec(line);
        if (res) {
            playerPoints[ playerPoints.length - 1 ].y -= 1;
            // queuePoints[ queuePoints.length - 1 ].y -= 1;
            continue;
        }

        regex = /LogOnlineGame: Display: Kicking player: .+ ; Reason = Host closed the connection/;
        res = regex.exec(line);
        if (res) {
            hostClosedConnectionPoints[ hostClosedConnectionPoints.length - 1 ].y += 3;
            // queuePoints[ queuePoints.length - 1 ].y -= 1;
            continue;
        }

        regex = /\[(.+)\].+LogSquad: OnPreLoadMap: Loading map .+\/([^\/]+)$/;
        res = regex.exec(line);
        if (res) {
            layers.push({
                x: 0,
                y: 150,
                label: res[ 2 ]
            })
            // layers[ layers.length - 1 ].y += 3;
            continue;
        }

        regex = /\[(.+)\].+LogWorld: SeamlessTravel to: .+\/([^\/]+)$/;
        res = regex.exec(line);
        if (res) {
            layers.push({
                x: chartPoints[ chartPoints.length - 1 ].x,
                y: 150,
                label: res[ 2 ]
            })
            // layers[ layers.length - 1 ].y += 3;
            continue;
        }

        regex = /Frag_C.*DamageInstigator=(BP_PlayerController_C_\d+) /;
        res = regex.exec(line);
        if (res) {
            fragPoints[ fragPoints.length - 1 ].y += 1;

            const playerController = res[ 1 ];
            if (!explosionCountersPerController[ playerController ]) explosionCountersPerController[ playerController ] = 0;
            explosionCountersPerController[ playerController ]++;

            continue;
        }

        regex = /ServerMove\: TimeStamp expired.+Character: (.+)/;
        res = regex.exec(line);
        if (res) {
            serverMovePoints[ serverMovePoints.length - 1 ].y += 0.05;

            const playerName = pawnsToPlayerNames[ res[ 1 ] ];
            const playerController = playerNameToPlayerController[ playerName ]
            if (!serverMoveTimestampExpiredPerPawn[ playerController ]) serverMoveTimestampExpiredPerPawn[ playerController ] = 0;
            serverMoveTimestampExpiredPerPawn[ playerController ]++;

            continue;
        }

        regex = /OnPossess\(\): PC=(.+) Pawn=(.+) FullPath/;
        res = regex.exec(line);
        if (res) {
            pawnsToPlayerNames[ res[ 2 ] ] = res[ 1 ];
            continue;
        }

        regex = /\[.+\]\[ ?(\d+)\]LogSquad: PostLogin: NewPlayer: BP_PlayerController_C.+PersistentLevel\.(.+)/;
        res = regex.exec(line);
        if (res) {
            chainIdToPlayerController[ res[ 1 ] ] = res[ 2 ];
            continue;
        }

        regex = /\[.+\]\[ ?(\d+)\]LogEOS: \[Category: LogEOSAntiCheat\] \[AntiCheatServer\] \[RegisterClient-001\].+AccountId: (\d+) IpAddress/;
        res = regex.exec(line);
        if (res) {
            playerControllerToSteamID[ chainIdToPlayerController[ res[ 1 ] ] ] = res[ 2 ];
            continue;
        }

        regex = /Die\(\): Player:.+from (.+) caused by (.+)/;
        res = regex.exec(line);
        if (res) {
            let playerController = res[ 1 ]
            if (!playerController || playerController == 'nullptr') {
                playerController = playerNameToPlayerController[ pawnsToPlayerNames[ res[ 2 ] ] ]
                // console.log(line)
            }
            if (!killsPerPlayerController[ playerController ]) killsPerPlayerController[ playerController ] = 0;
            killsPerPlayerController[ playerController ]++;
            continue;
        }

        // regex = /LogOnlineGame: Display: Kicking player: .+ ; Reason = Host closed the connection/;
        // res = regex.exec(line);
        // if (res) {
        //     playerPoints[ playerPoints.length - 1 ].y -= 1;
        //     continue;
        // }
        // res = null;
    }

    console.log(`\n\x1b[1m\x1b[34m### STARTING CHEATING REPORT: \x1b[32m${fileNameNoExt}\x1b[34m ###\x1b[0m`)
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
    console.log(`\x1b[1m\x1b[34m#### FINISHED CHEATING REPORT: \x1b[32m${fileNameNoExt}\x1b[34m ###\x1b[0m`)


    // chartPoints.forEach((v,i,

    const layerTextPlugin = {
        id: 'layerText',
        afterDatasetDraw(chart, args, pluginOptions) {
            // console.log(args.meta.dataset.label)
            const { ctx, data, chartArea: { left }, scales: { x, y } } = chart;
            const { chartArea } = chart;
            if (args.index != 4) return;

            const chartMaxY = chart.scales.y.max;
            data.datasets[ args.index ].data.forEach((dataPoint, index) => {
                ctx.font = 'bolder 35px sans-serif';
                ctx.fillStyle = "#888888";
                ctx.save();
                ctx.translate(x.getPixelForValue(dataPoint.x) + 30, chartArea.top + chartArea.height - (chartArea.height * (50 / chartMaxY)) - 30);
                ctx.rotate(Math.PI + 2)
                ctx.fillText(dataPoint.label, 0, 0)
                ctx.restore();
            })
        }
    }
    const serverNamePlugin = {
        id: 'layerText',
        afterDatasetDraw(chart, args, pluginOptions) {
            // console.log(args.meta.dataset.label)
            const { ctx, data, chartArea: { left }, scales: { x, y } } = chart;
            const { chartArea } = chart;
            if (args.index != 3) return;

            const chartMaxY = chart.scales.y.max;
            data.datasets[ args.index ].data.forEach((dataPoint, index) => {
                ctx.font = 'bolder 80px sans-serif';
                ctx.fillStyle = "#999999";
                ctx.save();
                ctx.translate(200, 80);
                ctx.fillText(serverName, 0, 0)
                ctx.restore();
            })
        }
    }
    const tpsColorPlugin = {
        id: 'tpsColor',
        // beforeRender: (chart, args, options) => {
        //     // const c = x.chart;
        //     //  console.log(options)

        //     const { ctx, data, chartArea: { left }, scales: { x, y } } = chart;
        //     const { chartArea } = chart;

        //     const dataset = data.datasets[ 0 ];
        //     const yScale = y;
        //     const yPos = yScale.getPixelForValue(0);

        //     // console.log(chart.height)
        //     const gradientFill = ctx.createLinearGradient(0, 0, 0, chart.height);
        //     gradientFill.addColorStop(0, '#FF0000');
        //     gradientFill.addColorStop(1, '#00FF00');


        //     // ctx.createLinearGradient()
        //     // gradientFill.addColorStop(yPos / chart.height, 'rgb(86,188,77)');
        //     // gradientFill.addColorStop(yPos / chart.height, 'rgb(229,66,66)');


        //     // const model = x._meta[ Object.keys(dataset._meta)[ 0 ] ].dataset._model;
        //     const dtMeta = chart.getDatasetMeta(0);
        //     const model = dtMeta.dataset;
        //     // console.log(chart.getDatasetMeta(0).dataset.getProps())
        //     console.log(model)

        //     // chart.getDatasetMeta(0).dataset.getProps()._model.borderColor = gradientFill

        //     // const model = dts_meta[ Object.keys(dtset._meta)[ 0 ] ].dataset._model;

        // },
    }
    // const layerTextPlugin = {
    //     id: 'layerText',
    //     afterDatasetDraw(chart, args, pluginOptions) {
    //         // console.log(args.meta.dataset.label)
    //         const { ctx, data, chartArea: { left }, scales: { x, y } } = chart;
    //         const { chartArea } = chart;
    //         if (args.index != 3) return;

    //         const chartMaxY = chart.scales.y.max;
    //         data.datasets[ args.index ].data.forEach((dataPoint, index) => {
    //             ctx.font = 'bolder 35px sans-serif';
    //             ctx.fillStyle = "#888888";
    //             ctx.save();
    //             ctx.translate(x.getPixelForValue(dataPoint.x) + 30, chartArea.top + chartArea.height - (chartArea.height * (50 / chartMaxY)) - 30);
    //             ctx.rotate(Math.PI + 2)
    //             ctx.fillText(dataPoint.label, 0, 0)
    //             ctx.restore();
    //         })
    //     }
    // }

    const ENABLE_TPS_BACKGROUND = false
    const chartBackground = {
        id: 'customCanvasBackgroundColor',
        beforeDraw: (chart, args, options) => {
            const { ctx, chartArea } = chart;
            // console.log(chart)
            // console.log(chartArea.left, chart.height - chartArea.height, chartArea.width, +chart.height - +chartArea.top)
            ctx.save();
            ctx.globalCompositeOperation = 'destination-over';

            const chartMaxY = chart.scales.y.max;

            if (ENABLE_TPS_BACKGROUND) {
                ctx.fillStyle = '#00FF0018';
                ctx.fillRect(chartArea.left, chartArea.top + chartArea.height - (chartArea.height * (50 / chartMaxY)), chartArea.width, chartArea.height * (25 / chartMaxY));

                ctx.fillStyle = '#FFFF0018';
                ctx.fillRect(chartArea.left, chartArea.top + chartArea.height - (chartArea.height * (25 / chartMaxY)), chartArea.width, chartArea.height * (10 / chartMaxY));

                ctx.fillStyle = '#FF000018';
                ctx.fillRect(chartArea.left, chartArea.top + chartArea.height - (chartArea.height * (15 / chartMaxY)), chartArea.width, chartArea.height * (15 / chartMaxY));
            }

            ctx.fillStyle = options.color || '#222224';
            ctx.fillRect(0, 0, chart.width, chart.height);

            // // ctx.fillRect(0, 0, chart.width, chart.height/2);
            ctx.restore();
        }
    }

    const chartCanvas = createCanvas(Math.max(Math.min(splitLogs.length / 120, 30000), 4000), 2000);
    Chart.defaults.font.size = 40;

    function tpsColorGradient(context) {
        const chart = context.chart;
        const { ctx, chartArea } = chart;

        if (!chartArea) return;

        const gradient = ctx.createLinearGradient(0, chart.scales.y.getPixelForValue(0), 0, chart.scales.y.getPixelForValue(50));

        gradient.addColorStop(15 / 50, 'red');
        gradient.addColorStop(15 / 50, 'yellow');
        gradient.addColorStop(25 / 50, 'yellow');
        gradient.addColorStop(25 / 50, '#00BBFF');
        // gradient.addColorStop(25 / 50, 'green');

        return gradient
    }

    function tpsColorGradientBackground(context) {
        const chart = context.chart;
        const { ctx, chartArea } = chart;

        if (!chartArea) return;

        const gradient = ctx.createLinearGradient(0, chart.scales.y.getPixelForValue(0), 0, chart.scales.y.getPixelForValue(50));

        const opacity = 29;
        gradient.addColorStop(15 / 50, `#FF0000${opacity}`);
        gradient.addColorStop(15 / 50, `#FFFF00${opacity}`);
        gradient.addColorStop(25 / 50, `#FFFF00${opacity}`);
        gradient.addColorStop(25 / 50, `#00BBFF${opacity}`);
        // gradient.addColorStop(25 / 50, 'green');

        return gradient
    }

    const chart = new Chart(chartCanvas, {
        type: "line",
        data: {
            xLabels: chartPoints.map(p => p.x),
            datasets: [
                {
                    pointStyle: 'circle',
                    pointRadius: 0,
                    label: 'TickRate',
                    data: chartPoints,
                    fill: true,
                    backgroundColor: tpsColorGradientBackground,
                    borderColor: tpsColorGradient,
                    segment: {
                        // borderColor: (context) => {
                        //     // console.log(context);
                        //     // var index = context.dataIndex;
                        //     // var value = context.dataset.data[ index ].y;
                        //     const defaultColor = '#00BBFF'
                        //     const p0 = context.p0.parsed?.y
                        //     const p1 = context.p1.parsed?.y
                        //     let value = Math.min(p0, p1)
                        //     if (Math.abs(p0 - p1) > 15) return defaultColor;

                        //     let color;
                        //     if (value <= 15) color = '#DD0000';
                        //     else if (value > 15 && value <= 25) color = '#FFDD00';
                        //     else color = defaultColor
                        //     // console.log(color)
                        //     // return value < 25 ? '#FF0000' : '#00BBFF'
                        //     return color;
                        // }

                    }
                },
                {
                    pointStyle: 'circle',
                    pointRadius: 0,
                    label: 'Player Count',
                    data: playerPoints,
                    backgroundColor: "#FF4466",
                    borderColor: "#FF4466",
                    // backgroundColor: "#FF0000"
                },
                {
                    pointStyle: 'circle',
                    pointRadius: 0,
                    label: 'Queue Count',
                    data: queuePoints,
                    backgroundColor: "#FF446666",
                    borderColor: "#FF446666",
                    // backgroundColor: "#BB2244",
                    // borderColor: "#BB2244",
                    // backgroundColor: "#FF0000"
                },
                {
                    pointStyle: 'circle',
                    pointRadius: 0,
                    label: 'HostClosedConnection*3',
                    data: hostClosedConnectionPoints,
                    backgroundColor: "#FFAA66",
                    borderColor: "#FF8822",
                },
                {
                    type: 'bar',
                    label: 'Layers',
                    data: layers,
                    barThickness: 5,
                    borderWidth: {
                        right: "100px",
                    },
                    borderSkipped: false,
                    // backgroundColor: "#FFCC0033",
                    // borderColor: "#FFCC0033",
                    backgroundColor: "#FFFFFF22",
                    borderColor: "#FFFFFF22",
                },
                {
                    pointStyle: 'circle',
                    pointRadius: 0,
                    label: 'Explosions',
                    data: fragPoints,
                    backgroundColor: "#ba01ba",
                    borderColor: "#ba01ba",
                },
                {
                    pointStyle: 'circle',
                    pointRadius: 0,
                    label: 'ServerMoveTSExp/20',
                    data: serverMovePoints,
                    backgroundColor: "#8888FF",
                    borderColor: "#8888FF",
                },
            ]
        },
        options: {
            // layout: {
            //     padding: 50
            // },
            layout: {
                padding: {
                    left: 200,
                    right: 50,
                    top: 150,
                    bottom: 50
                }
            },
            scales: {
                x: {
                    min: 0,
                    max: chartPoints.length,
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
                    // grid: {
                    //     lineWidth: 5,
                    //     color: function (context) {
                    //         if (context.tick.value <= 15) {
                    //             return "#FF000018";
                    //         } else if (context.tick.value <= 25) {
                    //             return "#FFFF0018";
                    //         } else if (context.tick.value <= 50) {
                    //             return "#00FF0018";
                    //         }

                    //         return "#00000000"
                    //     },
                    // },
                }
            }
        },
        plugins: [
            chartBackground,
            layerTextPlugin,
            // tpsColorPlugin,
            serverNamePlugin
        ]


    });

    return chartCanvas;
}

function getDateTime(date) {
    const parts = date.replace(/:\d+$/, '').replace(/-/, 'T').split('T');
    parts[ 0 ] = parts[ 0 ].replace(/\./g, '-')
    parts[ 1 ] = parts[ 1 ].replace(/\./g, ':')
    const res = `${parts.join('T')}Z`;
    return new Date(res)
}

main();