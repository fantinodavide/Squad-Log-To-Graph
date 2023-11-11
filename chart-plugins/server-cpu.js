export default function (serverCPU, canvasWidth, canvasHeight) {
    return {
        id: 'layerText',
        afterDatasetDraw(chart, args, pluginOptions) {
            // console.log(args.meta.dataset.label)
            const { ctx, data, chartArea: { left }, scales: { x, y } } = chart;
            const { chartArea } = chart;
            if (args.index != 3) return;

            const chartMaxY = chart.scales.y.max;
            data.datasets[ args.index ].data.forEach((dataPoint, index) => {
                ctx.font = 'bolder 50px sans-serif';
                ctx.fillStyle = "#999999";
                ctx.save();
                ctx.translate(550, canvasHeight - 60);
                ctx.fillText(serverCPU, 0, 0)
                ctx.restore();
            })
        }
    }
}