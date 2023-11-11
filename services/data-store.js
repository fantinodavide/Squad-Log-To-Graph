export default class DataStore {
    constructor() {
        this.timePoints = [];
        this.counters = new Map();
    }

    incrementCounter(key, incrementer, time = null) {
        const counter = this.counters.get(key);
        const value = +(counter?.length > 0 ? counter[ counter.length - 1 ].y : 0) + incrementer;
        return this.setNewCounterValue(key, value, null, time)
    }

    incrementCounterLast(key, incrementer) {
        const counter = this.counters.get(key);
        counter[ counter.length - 1 ].y += incrementer;
    }

    setNewCounterValue(key, value, label, time = null) {
        if (time) this.addTimePoint(time);
        else time = this.getLastTimePoint();

        if (!this.counters.get(key))
            this.counters.set(key, []);
        const obj = {
            y: value,
            x: time,
            label: label
        }
        this.counters.get(key).push(obj)
        return obj;
    }

    addTimePoint(time) {
        // time.setMilliseconds(0)
        if (this.timePoints.indexOf(time) < 0)
            this.timePoints.push(time);
    }

    getLastTimePoint() {
        return this.timePoints[ this.timePoints.length - 1 ];
    }

    getTimePoints() {
        return this.timePoints;
    }

    getCounterData(key) {
        return this.counters.get(key);
    }

    getCounterLastValue(key) {
        const data = this.getCounterData(key)
        return data[ data.length - 1 ]
    }

    getCounters() {
        return [ ...this.timeData.keys() ];
    }
}