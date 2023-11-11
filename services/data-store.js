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

        const oldCounter = this.counters.get(key);
        if (!oldCounter)
            this.counters.set(key, []);
        const newObj = {
            y: value,
            x: time,
            label: label
        }
        if (oldCounter) {
            const oldObjDuplication = {
                y: oldCounter[ oldCounter.length - 1 ].y,
                x: time,
                label: label
            }
            this.counters.get(key).push(oldObjDuplication)
        }
        this.counters.get(key).push(newObj)
        return newObj;
    }

    addTimePoint(time) {
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