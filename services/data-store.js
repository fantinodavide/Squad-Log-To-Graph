const RESET_FREQUENCY_SECONDS = 30;
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

    incrementFrequencyCounter(key, incrementer) {

        const timeNow = this.getLastTimePoint();
        const counter = this.counters.get(key);
        if (!counter || +timeNow.time - +counter[ counter.length - 1 ].time > RESET_FREQUENCY_SECONDS * 1000)
            this.resetFrequencyCounter(key)

        this.incrementCounter(key, incrementer)
    }

    resetFrequencyCounter(key) {
        const timeNow = this.getLastTimePoint();
        const counter = this.counters.get(key);
        if (counter?.length > 0)
            this.setNewCounterValue(key, 0, undefined, counter[ counter.length - 1 ].time)
        this.setNewCounterValue(key, 0)

    }

    setNewCounterValue(key, value, label, time = null) {
        if (time && +time > 0) time = this.addTimePoint(time);
        else time = this.getLastTimePoint();

        const oldCounter = this.counters.get(key);
        if (!oldCounter)
            this.counters.set(key, []);
        const newObj = {
            y: value,
            x: time.formatted,
            time: time.time,
            label: label
        }
        if (oldCounter) {
            const oldObjDuplication = {
                y: oldCounter[ oldCounter.length - 1 ].y,
                x: time.formatted,
                time: time.time,
                label: label
            }
            this.counters.get(key).push(oldObjDuplication)
        }
        this.counters.get(key).push(newObj)
        return newObj;
    }

    addTimePoint(time) {
        const obj = {
            time: time,
            formatted: time.toLocaleString()
        }
        if (!this.timePoints.find(t => +t.time == +obj.time))
            this.timePoints.push(obj);
        return obj;
    }

    getLastTimePoint() {
        return this.timePoints[ this.timePoints.length - 1 ];
    }

    getTimePoints() {
        return this.timePoints.map(p => p.formatted);
    }

    getCounterData(key) {
        return this.counters.get(key) || [];
    }

    getCounterLastValue(key) {
        const data = this.getCounterData(key)
        return data[ data.length - 1 ]
    }

    getCounters() {
        return [ ...this.timeData.keys() ];
    }
}