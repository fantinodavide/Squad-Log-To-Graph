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

    for (let logFile of files) {
        const logPath = path.join(INPUT_DIR, logFile);
        const fileNameNoExt = logFile.replace(/\.[^\.]+$/, '');
        const outputPath = path.join(OUPUT_DIR, `${fileNameNoExt}.png`)

        const logs = fs.readFileSync(logPath).toString();
        const graph = drawGraph(logs)

        fs.writeFileSync(outputPath, graph.toBuffer("image/png"))
    }
}

function drawGraph(logs /*string*/) {
    let chartPoints = [];
    let playerPoints = [ {
        x: 0,
        y: 0
    } ];
    let hostClosedConnectionPoints = [ {
        x: 0,
        y: 0
    } ];
    let layers = []

    const splitLogs = logs.split('\n');
    for (let line of splitLogs) {
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
            hostClosedConnectionPoints.push({
                x: obj.x,
                y: 0
            })

            // console.log('TPS', obj);
            continue;
        }

        // regex = /^\[([0-9.:-]+)]\[([ 0-9]*)]LogNet: AddClientConnection: Added client connection: \[UNetConnection\] RemoteAddr: .+, Name: (.+), Driver: GameNetDriver .+, IsServer: YES, PC: NULL, Owner: NULL, UniqueId: INVALID/;
        regex = /LogNet: Join succeeded/;
        // regex = /LogNet: Client netspeed is/;
        res = regex.exec(line);
        // console.log(res);
        if (res) {
            playerPoints[ playerPoints.length - 1 ].y += 1;
            // console.log(playerPoints[ playerPoints.length - 1 ].y)
            continue;
        }

        // regex = /LogNet: UNetConnection::Close: \[UNetConnection\] RemoteAddr: .+, Name: .+, Driver: GameNetDriver .+, IsServer: YES, PC: (.+), Owner: .+/;
        // regex = /LogOnline: STEAM: \d+ has been removed/;
        regex = /LogNet: UChannel::Close: Sending CloseBunch\. ChIndex == \d\. Name: \[UChannel\] ChIndex: \d, Closing: \d \[UNetConnection\] RemoteAddr: \d+\:\d+, Name: .+, Driver: .+, IsServer: YES, PC:.+Player.+/;
        res = regex.exec(line);
        if (res) {
            playerPoints[ playerPoints.length - 1 ].y -= 1;
            continue;
        }

        regex = /LogOnlineGame: Display: Kicking player: .+ ; Reason = Host closed the connection/;
        res = regex.exec(line);
        if (res) {
            hostClosedConnectionPoints[ hostClosedConnectionPoints.length - 1 ].y += 3;
            continue;
        }

        regex = /\[(.+)\].+LogSquad: OnPreLoadMap: Loading map .+\/([^\/]+)$/;
        res = regex.exec(line);
        if (res) {
            layers.push({
                x: 0,
                y: 100,
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
                y: 100,
                label: res[ 2 ]
            })
            // layers[ layers.length - 1 ].y += 3;
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
    // chartPoints.forEach((v,i,

    const layerTextPlugin = {
        id: 'layerText',
        afterDatasetDraw(chart, args, pluginOptions) {
            // console.log(args.meta.dataset.label)
            const { ctx, data, chartArea: { left }, scales: { x, y } } = chart;
            if (args.index != 3) return;

            data.datasets[ args.index ].data.forEach((dataPoint, index) => {
                ctx.font = 'bolder 35px sans-serif';
                ctx.fillStyle = "#888888";
                ctx.save();
                ctx.translate(x.getPixelForValue(dataPoint.x) + 30, 550);
                ctx.rotate(Math.PI + 2)
                ctx.fillText(dataPoint.label, 0, 0)
                ctx.restore();
            })
        }
    }

    const chartCanvas = createCanvas(Math.min(splitLogs.length / 120, 30000), 1500);
    Chart.defaults.font.size = 40;
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
                    backgroundColor: "#00BBFF",
                    borderColor: "#00BBFF",
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
                    label: 'HostClosedConnection*3',
                    data: hostClosedConnectionPoints,
                    backgroundColor: "#FFAA66",
                    borderColor: "#FF8822",
                    // backgroundColor: "#FF0000"
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
                }
            ]
        },
        options: {
            // layout: {
            //     padding: {
            //         left: 200,
            //         right: 50,
            //         top: 50,
            //         bottom: 50
            //     }
            // },
            scales: {
                x: {
                    min: 0,
                    max: chartPoints.length
                },
                y: {
                    min: 0,
                    max: 100,
                    ticks: {
                        stepSize: 5
                    },
                    grid: {
                        lineWidth: 56,
                        color: function (context) {
                            if (context.tick.value <= 15) {
                                return "#FF000018";
                            } else if (context.tick.value <= 25) {
                                return "#FFFF0018";
                            } else if (context.tick.value <= 50) {
                                return "#00FF0018";
                            }

                            return "#00000000"
                        },
                    },
                }
            }
        },
        plugins: [
            {
                id: 'customCanvasBackgroundColor',
                beforeDraw: (chart, args, options) => {
                    const { ctx } = chart;
                    ctx.save();
                    ctx.globalCompositeOperation = 'destination-over';
                    ctx.fillStyle = options.color || '#222224';
                    ctx.fillRect(0, 0, chart.width, chart.height);
                    ctx.restore();
                }
            },
            layerTextPlugin
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