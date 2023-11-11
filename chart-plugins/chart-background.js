export default function (ENABLE_TPS_BACKGROUND) {
    return {
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
}