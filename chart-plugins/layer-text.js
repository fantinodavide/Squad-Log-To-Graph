export default function () {
    return {
        id: 'layerText',
        afterDatasetDraw(chart, args, pluginOptions) {
            // console.log(args.meta.dataset.label)
            const { ctx, data, chartArea: { left }, scales: { x, y } } = chart;
            const { chartArea } = chart;
            if (args.index != 0) return;

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
}