// This file is reserved to refactor all CX3* modules, so atm it is doing nothing but needed. Don't touch this.
const MAGIC_IDENTIFIER = 'CX3_MAGIC'

const loaded = true
const uid = Date.now()

const magicPool = new Map()

const getL = (rgba) => {
  let [r, g, b, a] = rgba.match(/^rgba?\((\d+),\s*(\d+),\s*(\d+)(?:,\s*(\d+\.{0,1}\d*))?\)$/).slice(1)
  r /= 255
  g /= 255
  b /= 255
  const l = Math.max(r, g, b)
  const s = l - Math.min(r, g, b)
  const h = s ? l === r ? (g - b) / s : l === g ? 2 + (b - r) / s : 4 + (r - g) / s : 0
  // let rh = 60 * h < 0 ? 60 * h + 360 : 60 * h
  // let rs = 100 * (s ? (l <= 0.5 ? s / (2 * l - s) : s / (2 - (2 * l - s))) : 0)
  let rl = (100 * (2 * l - s)) / 2
  return rl
}

const regularizeEvents = ({storedEvents, eventPool, sender, payload, config}) => {
  eventPool.set(sender.identifier, JSON.parse(JSON.stringify(payload)))
  let calendarSet = (Array.isArray(config.calendarSet)) ? [...config.calendarSet] : []
  if (calendarSet.length > 0) {
    eventPool.set(sender.identifier, eventPool.get(sender.identifier).filter((ev) => {
      return (calendarSet.includes(ev.calendarName))
    }).map((ev) => {
      let i = calendarSet.findIndex((name) => {
        return name === ev.calendarName
      }) + 1
      ev.calendarSeq = i
      return ev
    }))
  }
  storedEvents = [...eventPool.values()].reduce((result, cur) => {
    return [...result, ...cur]
  }, [])

  if (typeof config.preProcessor === 'function') {
    storedEvents = storedEvents.map(config.preProcessor)
  }

  return storedEvents
}

/* DEPRECATED */
const scheduledRefresh = ({refreshTimer, refreshInterval, job}) => {
  if (refreshTimer) {
    clearTimeout(refreshTimer)
    refreshTimer = null
  }
  refreshTimer = setTimeout(() => {
    clearTimeout(refreshTimer)
    refreshTimer = null
    job()
  }, refreshInterval)
}

const renderEventDefault = (event) => {
  let e = document.createElement('div')
  e.classList.add('event')
  event.calendarName ? e.classList.add('calendar_' + encodeURI(event.calendarName)) : null
  if (event?.class) e.classList.add(event.class)
  if (event.fullDayEvent) e.classList.add('fullday')
  if (event.isPassed) e.classList.add('passed')
  if (event.isCurrent) e.classList.add('current')
  if (event.isFuture) e.classList.add('future')
  if (event.isMultiday) e.classList.add('multiday')
  if (!(event.isMultiday || event.fullDayEvent)) e.classList.add('singleday')    
  e.dataset.calendarSeq = event?.calendarSeq ?? 0
  event.calendarName ? (e.dataset.calendarName = event.calendarName) : null 
  e.dataset.color = event.color
  e.dataset.description = event.description || ''
  e.dataset.title = event.title
  e.dataset.fullDayEvent = event.fullDayEvent
  e.dataset.geo = event.geo
  e.dataset.location = event.location || ''
  e.dataset.startDate = event.startDate
  e.dataset.endDate = event.endDate
  e.dataset.today = event.today
  e.dataset.symbol = event.symbol.join(' ')

  e.style.setProperty('--calendarColor', event.color)

  //console.log('>', this.instanceId) // TODO : Make sharable.
  oppositeMagic(e, event)
  return e
} 

let renderSymbol = (e, event, useSymbol) => {
  if (useSymbol && Array.isArray(event.symbol) && event.symbol.length > 0) {
    event.symbol.forEach((symbol) => {
      let exDom = document.createElement('span')
      exDom.classList.add('symbol')
      if (symbol) {
        exDom.classList.add('fa', ...(symbol.split(' ').map((s) => {
          return 'fa-' + (s.replace(/^fa\-/i, ''))
        })))
        e.classList.add('useSymbol')
      } else {
        exDom.classList.add('noSymbol')
      }
      e.appendChild(exDom)
    })
  } else {
    let exDom = document.createElement('span')
    exDom.classList.add('noSymbol', 'symbol')
    e.appendChild(exDom)
  }
}


const renderEvent = (event, {
  useSymbol
}) => {
  let e = renderEventDefault(event)
  renderSymbol(e, event, useSymbol)

  let t = document.createElement('span') 
  t.classList.add('title', 'eventTitle')
  t.innerHTML = event.title
  e.appendChild(t)
  return e
}

const renderEventAgenda = (event, {useSymbol, eventTimeOptions, locale}, tm)=> {
  let e = renderEventDefault(event)

  let headline = document.createElement('div')
  headline.classList.add('headline')
  renderSymbol(headline, event, useSymbol)

  let time = document.createElement('div')
  time.classList.add('period')

  let startTime = document.createElement('div')
  let st = new Date(+event.startDate)
  startTime.classList.add('time', 'startTime', (st.getDate() === tm.getDate()) ? 'inDay' : 'notInDay')
  startTime.innerHTML = new Intl.DateTimeFormat(locale, eventTimeOptions).formatToParts(st).reduce((prev, cur, curIndex, arr) => {
    prev = prev + `<span class="eventTimeParts ${cur.type} seq_${curIndex}">${cur.value}</span>`
    return prev
  }, '')
  headline.appendChild(startTime)

  let endTime = document.createElement('div')
  let et = new Date(+event.endDate)
  endTime.classList.add('time', 'endTime', (et.getDate() === tm.getDate()) ? 'inDay' : 'notInDay')
  endTime.innerHTML = new Intl.DateTimeFormat(locale, eventTimeOptions).formatToParts(et).reduce((prev, cur, curIndex, arr) => {
    prev = prev + `<span class="eventTimeParts ${cur.type} seq_${curIndex}">${cur.value}</span>`
    return prev
  }, '')
  headline.appendChild(endTime)

  let title = document.createElement('div')
  title.classList.add('title')
  title.innerHTML = event.title
  headline.appendChild(title)
  e.appendChild(headline)
  let description = document.createElement('div')
  description.classList.add('description')
  description.innerHTML = event.description || ''
  e.appendChild(description)
  let location = document.createElement('div')
  location.classList.add('location')
  location.innerHTML = event.location || ''
  e.appendChild(location)

  return e
}

const oppositeMagic = (e, original) => {
  if (magicPool.has(original.color)) {
    original.oppositeColor = magicPool.get(original.color)
  } else {
    let magic = prepareMagic()
    magic.style.color = original.color
    let l = getL(window.getComputedStyle(magic).getPropertyValue('color'))
    original.oppositeColor = (l > 50) ? 'black' : 'white'
  }
  e.style.setProperty('--oppositeColor', original.oppositeColor)
}

const formatEvents = ({original, config}) => {
  const thisMoment = new Date()

  let events = original.sort((a, b) => {
    return (a.startDate === b.startDate) ? a.endDate - b.endDate : a.startDate - b.startDate
  }).map((ev) => {
    ev.startDate = +ev.startDate
    ev.endDate = +ev.endDate
    let et = new Date(+ev.endDate)
    if (et.getHours() === 0 && et.getMinutes() === 0 && et.getSeconds() === 0 && et.getMilliseconds() === 0) ev.endDate = ev.endDate - 1
    ev.isPassed = isPassed(ev)
    ev.isCurrent = isCurrent(ev)
    ev.isFuture = isFuture(ev)
    ev.isFullday = ev.fullDayEvent
    ev.isMultiday = isMultiday(ev)
    ev.today = thisMoment.toISOString().split('T')[0] === new Date(+ev.startDate).toISOString().split('T')[0]
    return ev
  })

  if (typeof config.eventFilter === 'function') {
    events = events.filter(config.eventFilter)
  }
  if (typeof config.eventTransformer === 'function') {
    events = events.map(config.eventTransformer)
  }
  if (typeof config.eventSorter === 'function') {
    events = events.sort(config.eventSorter)
  }

  return events
}

const prepareEvents = ({storedEvents, config, range}) => {
  let events = storedEvents.filter((evs) => {
    return !(evs.endDate <= range[0] || evs.startDate >= range[1])
  })
  
  return formatEvents({original: events, config})
}



const eventsByDate = ({storedEvents, config, startTime, dayCounts}) => {
  let events = formatEvents({original: storedEvents, config})
  let ebd = events.reduce((days, ev) => {
    if (ev.endDate < startTime) return days

    let st = new Date(+ev.startDate)
    let et = new Date(+ev.endDate)

    while(st.getTime() < et.getTime()) {
      let day = new Date(st.getFullYear(), st.getMonth(), st.getDate(), 0, 0, 0, 0).getTime()
      if (!days.has(day)) days.set(day, [])
      days.get(day).push(ev)
      st.setDate(st.getDate() + 1)
    }
    return days
  }, new Map())

  let startDay = new Date(+startTime).setHours(0, 0, 0, 0)
  let days = Array.from(ebd.keys()).sort()
  let position = days.findIndex((d) => d >= startDay)

  return days.slice(position, position + dayCounts).map((d) => {
    return {
      date: d,
      events: ebd.get(d)
    }
  })
}

const prepareMagic = () => {
  let magic = document.getElementById(MAGIC_IDENTIFIER)
  if (!magic) {
    magic = document.createElement('div')
    magic.id = MAGIC_IDENTIFIER
    magic.style.display = 'none'
    document.body.appendChild(magic)
  }
  return magic
}

const initModule = (m, language) => {
  m.storedEvents = []
  m.locale = Intl.getCanonicalLocales(m.config.locale ?? language )?.[0] ?? ''
  m.refreshTimer = null
  m.eventPool = new Map()
}

const displayLegend = (dom, events, options = {}) => {
  let lDom = document.createElement('div')
  lDom.classList.add('legends')
  let legendData = new Map()
  for (let ev of events) {
    if (!legendData.has(ev.calendarName)) legendData.set(ev.calendarName, {
      name: ev.calendarName,
      color: ev.color ?? null,
      oppositeColor: ev.oppositeColor,
      symbol: ev.symbol ?? []
    })
  }
  for (let l of legendData.values()) {
    let ld = document.createElement('div')
    ld.classList.add('legend')
    if (options?.useSymbol) {
      ld.classList.add('useSymbol') 
    }
    l.symbol.forEach((symbol) => {
      let exDom = document.createElement('span')
      exDom.classList.add('symbol')
      if (symbol) {
        exDom.classList.add('fa', ...(symbol.split(' ').map((s) => {
          return 'fa-' + (s.replace(/^fa\-/i, ''))
        })))
      } else {
        exDom.classList.add('noSymbol')
      }
      ld.appendChild(exDom)
    })
    let t = document.createElement('span')
    t.classList.add('title')
    t.innerHTML = l.name
    ld.appendChild(t)
    ld.style.setProperty('--calendarColor', l.color)
    ld.style.setProperty('--oppositeColor', l.oppositeColor)
    lDom.appendChild(ld)
  }
  dom.appendChild(lDom)
}

const isToday = (d) => {
  let tm = new Date()
  let start = (new Date(tm.getTime())).setHours(0, 0, 0, 0)
  let end = (new Date(tm.getTime())).setHours(23, 59, 59, 999)
  return (d.getTime() >= start && d.getTime() <= end)
}

const isThisMonth = (d) => {
  let tm = new Date()
  let start = new Date(tm.getFullYear(), tm.getMonth(), 1)
  let end = new Date(start.getFullYear(), start.getMonth() + 1, 0, 23, 59, 59, 999)
  return (d.getTime() >= start && d.getTime() <= end)
}

const isThisYear = (d) => {
  let tm = new Date()
  let start = new Date(tm.getFullYear(), 1, 1)
  let end = new Date(tm.getFullYear(), 11, 31, 23, 59, 59, 999)
  return (d.getTime() >= start && d.getTime() <= end)
}

const getBeginOfWeek = (d, options) => {
  return new Date(d.getFullYear(), d.getMonth(), d.getDate() - (d.getDay() - options.firstDayOfWeek + 7 ) % 7)
}

const getEndOfWeek = (d, options) => {
  let b = getBeginOfWeek(d, options)
  return new Date(b.getFullYear(), b.getMonth(), b.getDate() + 6, 23, 59, 59, 999)
}

const getWeekNo = (d, options) => {
  let bow = getBeginOfWeek(d, options)
  let fw = getBeginOfWeek(new Date(d.getFullYear(), 0, options.minimalDaysOfNewYear), options)
  if (bow.getTime() < fw.getTime()) fw = getBeginOfWeek(new Date(d.getFullYear() - 1, options), 0, options.minimalDayosOfNewYear)
  let count = 1;
  let t = new Date(fw.getTime())
  while (bow.getTime() > t.getTime()) {
    t.setDate(t.getDate() + 7)
    count++;
  }
  return count
}

const isPassed = (ev) => {
  return (ev.endDate < Date.now())
}

const isFuture = (ev) => {
  return (ev.startDate > Date.now())
}

const isCurrent = (ev) => {
  let tm = Date.now()
  return (ev.endDate >= tm && ev.startDate <= tm)
}

const isMultiday = (ev) => {
  let s = new Date(+ev.startDate)
  let e = new Date(+ev.endDate)
  return ((s.getDate() !== e.getDate())
    || (s.getMonth() !== e.getMonth())
    || (s.getFullYear() !== e.getFullYear()))
}

const getRelativeDate = (d, index) => {
  return new Date(d.getFullYear(), d.getMonth(), d.getDate() + index)
}

const gapFromToday = (d) => {
  const MS = 24 * 60 * 60 * 1000
  const t = new Date()
  return Math.floor((Date.UTC(d.getFullYear(), d.getMonth(), d.getDate()) - Date.UTC(t.getFullYear(), t.getMonth(), t.getDate())) / MS)
}

const makeWeatherDOM = (parentDom, forecasted) => {
  if (forecasted && forecasted?.weatherType) {
    let weatherDom = document.createElement('div')
    weatherDom.classList.add('cellWeather')
    let icon = document.createElement('span')
    icon.classList.add('wi', 'wi-' + forecasted.weatherType)
    weatherDom.appendChild(icon)
    let maxTemp = document.createElement('span')
    maxTemp.classList.add('maxTemp', 'temperature')
    maxTemp.innerHTML = Math.round(forecasted.maxTemperature)
    weatherDom.appendChild(maxTemp)
    let minTemp = document.createElement('span')
    minTemp.classList.add('minTemp', 'temperature')
    minTemp.innerHTML = Math.round(forecasted.minTemperature)
    weatherDom.appendChild(minTemp)
    parentDom.appendChild(weatherDom)
  }
  return parentDom
}



export {
  uid,
  loaded,
  initModule,
  regularizeEvents,
  //scheduledRefresh,
  prepareEvents,
  eventsByDate,
  renderEvent,
  renderEventAgenda,
  prepareMagic,
  displayLegend,
  isToday,
  isThisMonth,
  isThisYear,
  getBeginOfWeek,
  getEndOfWeek,
  getWeekNo,
  isPassed,
  isFuture,
  isCurrent,
  isMultiday,
  getRelativeDate,
  gapFromToday,
  makeWeatherDOM
}