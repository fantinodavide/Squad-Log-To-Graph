export default function (serverVersion, canvasWidth, canvasHeight) {
    if (!serverVersion) serverVersion = ""
    return {
        id: 'layerText',
        afterDatasetDraw(chart, args, pluginOptions) {
            const { ctx, data, chartArea: { left }, scales: { x, y } } = chart;
            const { chartArea } = chart;

            const chartMaxY = chart.scales.y.max;
            data.datasets[ args.index ].data.forEach((dataPoint, index) => {
                ctx.font = 'bolder 50px sans-serif';
                ctx.fillStyle = "#999999";
                ctx.save();
                ctx.translate(50, canvasHeight - 60);
                ctx.fillText(serverVersion, 0, 0)
                ctx.restore();
            })
        }
    }
}