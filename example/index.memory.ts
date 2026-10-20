import { bootstrap } from './bootstrap.js'
import { inMemoryMessaging } from './messaging.js'

await bootstrap(inMemoryMessaging(), 3000)
