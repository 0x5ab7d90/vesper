import { cronJobs } from 'convex/server'
import { internal } from './_generated/api'

const crons = cronJobs()

crons.interval('presence online webhook', { seconds: 20 }, internal.presenceMonitor.sweep)
crons.interval('imdb sync', { minutes: 30 }, internal.imdb.sweep)

export default crons
