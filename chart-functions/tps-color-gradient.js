export default function (context) {
    const chart = context.chart;
    const { ctx, chartArea } = chart;

    if (!chartArea) return;

    const gradient = ctx.createLinearGradient(0, chart.scales.y.getPixelForValue(0), 0, chart.scales.y.getPixelForValue(50));

    gradient.addColorStop(15 / 50, 'red');
    gradient.addColorStop(15 / 50, 'yellow');
    gradient.addColorStop(25 / 50, 'yellow');
    gradient.addColorStop(25 / 50, '#00BBFF');

    return gradient
}