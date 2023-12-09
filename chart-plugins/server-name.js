export default function (serverName) {
    if (!serverName) serverName = ""
    return {
        id: 'layerText',
        afterDatasetDraw(chart, args, pluginOptions) {
            const { ctx, data, chartArea: { left }, scales: { x, y } } = chart;
            const { chartArea } = chart;

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
}