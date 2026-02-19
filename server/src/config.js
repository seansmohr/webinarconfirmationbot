require('dotenv').config({ path: require('path').resolve(__dirname, '../../.env') });

module.exports = {
  ghl: {
    apiKey: process.env.GHL_API_KEY,
    locationId: process.env.GHL_LOCATION_ID,
    pipelineId: process.env.GHL_PIPELINE_ID || null,
    baseUrl: 'https://services.leadconnectorhq.com',
  },
  retell: {
    apiKey: process.env.RETELL_API_KEY,
    agentIdCall1: process.env.RETELL_AGENT_ID_CALL1,
    agentIdCall2: process.env.RETELL_AGENT_ID_CALL2,
    fromNumberCall1: process.env.RETELL_FROM_NUMBER_CALL1,
    fromNumberCall2: process.env.RETELL_FROM_NUMBER_CALL2,
  },
  db: {
    url: process.env.DATABASE_URL,
  },
  server: {
    port: parseInt(process.env.PORT || '3001', 10),
    clientUrl: process.env.CLIENT_URL || 'http://localhost:5173',
    nodeEnv: process.env.NODE_ENV || 'development',
  },
  // Webinar schedule: tag -> { day (0=Sun), hour in CST (24h), label }
  webinarSchedule: {
    'tuesday 11am':  { dayOfWeek: 2, hourCST: 11, minuteCST: 0, label: 'Tuesday 11:00 AM CST' },
    'tuesday 6pm':   { dayOfWeek: 2, hourCST: 18, minuteCST: 0, label: 'Tuesday 6:00 PM CST' },
    'thursday 1pm':  { dayOfWeek: 4, hourCST: 13, minuteCST: 0, label: 'Thursday 1:00 PM CST' },
    'saturday 11am': { dayOfWeek: 6, hourCST: 11, minuteCST: 0, label: 'Saturday 11:00 AM CST' },
    'friday 5pm': { dayOfWeek: 5, hourCST: 19, minuteCST: 0, label: 'Friday 5:00 PM PST / 7:00 PM CST' },
  },
  // Call windows in PST (24h format)
  callWindows: [9, 13, 17], // 9am, 1pm, 5pm PST
};
