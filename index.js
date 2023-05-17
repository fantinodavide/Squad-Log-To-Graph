// import { Chart, controllers, registerables } from "chart.js";
import Chart from 'chart.js/auto';
import { createCanvas, loadImage } from 'canvas';
import fs from 'fs';

async function main() {
    const logs = fs.readFileSync('SquadGame.log').toString();
    let chartPoints = [];
    let playerPoints = [ {
        x: 0,
        y: 0
    } ];

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
            playerPoints.push({
                x: obj.x,
                y: playerPoints[ playerPoints.length - 1 ].y
            })

            // console.log('TPS', obj);
            continue;
        }
        res = null;

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
        res = null;

        // regex = /LogNet: UNetConnection::Close: \[UNetConnection\] RemoteAddr: .+, Name: .+, Driver: GameNetDriver .+, IsServer: YES, PC: (.+), Owner: .+/;
        // regex = /LogOnline: STEAM: \d+ has been removed/;
        regex = /LogNet: UChannel::Close: Sending CloseBunch\. ChIndex == \d\. Name: \[UChannel\] ChIndex: \d, Closing: \d \[UNetConnection\] RemoteAddr: \d+\:\d+, Name: .+, Driver: GameNetDriver .+, IsServer: YES, PC: .+, Owner: BP_PlayerController_C_.+, UniqueId: Steam:UNKNOWN/;
        res = regex.exec(line);
        if (res) {
            playerPoints[ playerPoints.length - 1 ].y -= 1;
            continue;
        }
        res = null;

        // regex = /LogOnlineGame: Display: Kicking player: .+ ; Reason = Host closed the connection/;
        // res = regex.exec(line);
        // if (res) {
        //     playerPoints[ playerPoints.length - 1 ].y -= 1;
        //     continue;
        // }
        // res = null;
    }
    // chartPoints.forEach((v,i,
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
                },
                {
                    pointStyle: 'circle',
                    pointRadius: 0,
                    label: 'Player Count',
                    data: playerPoints,
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
                        lineWidth: 54,
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
        plugins: [ {
            id: 'customCanvasBackgroundColor',
            beforeDraw: (chart, args, options) => {
                const { ctx } = chart;
                ctx.save();
                ctx.globalCompositeOperation = 'destination-over';
                ctx.fillStyle = options.color || '#222224';
                ctx.fillRect(0, 0, chart.width, chart.height);
                ctx.restore();
            }
        } ]
    });

    fs.writeFileSync('chart.png', chartCanvas.toBuffer("image/png"))
}

function getDateTime(date) {
    const parts = date.replace(/:\d+$/, '').replace(/-/, 'T').split('T');
    parts[ 0 ] = parts[ 0 ].replace(/\./g, '-')
    parts[ 1 ] = parts[ 1 ].replace(/\./g, ':')
    const res = `${parts.join('T')}Z`;
    return new Date(res)
}

main();