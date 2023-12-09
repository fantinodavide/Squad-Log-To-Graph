export default function (serverCPU, canvasWidth, canvasHeight) {
    if (!serverCPU) serverCPU = ""
    return {
        id: 'layerText',
        afterDatasetDraw(chart, args, pluginOptions) {
            if (args.index != 12) return;
            const { ctx, data, chartArea: { left }, scales: { x, y } } = chart;

            ctx.font = 'bolder 50px sans-serif';
            ctx.fillStyle = "#999999";
            ctx.save();
            ctx.translate(550, canvasHeight - 60);
            ctx.fillText(serverCPU, 0, 0)
            ctx.restore();
        }
    }
}