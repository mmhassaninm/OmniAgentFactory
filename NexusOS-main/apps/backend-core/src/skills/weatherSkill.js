import axios from 'axios';
import logger from '@nexus/logger';

/**
 * WeatherSkill
 * Retrieves real-time weather data and forecasts utilizing the Open-Meteo API.
 * Requires no API keys natively, aligning perfectly with OS autonomy.
 */
class WeatherSkill {
    constructor() {
        this.geocodingUrl = 'https://geocoding-api.open-meteo.com/v1/search';
        this.weatherUrl = 'https://api.open-meteo.com/v1/forecast';
        logger.info('[WeatherSkill] ⛅ Environment & Weather Skill Initialized.');
    }

    async executeIntent(args) {
        if (!args || !args.action || !args.location) {
            return { success: false, error: 'Both action and location are required for WeatherSkill.' };
        }

        const { action, location, days = 1 } = args;
        logger.info(`[WeatherSkill] ⛅ Executing Action: ${action} for location: ${location}`);

        try {
            // Step 1: Resolve city to Lat/Long
            const coords = await this._getCoordinates(location);
            if (!coords) {
                return { success: false, error: `Could not resolve coordinates for location: ${location}` };
            }

            // Step 2: Fetch Weather Data
            let endpointParams = `?latitude=${coords.latitude}&longitude=${coords.longitude}&timezone=auto`;

            switch (action) {
                case 'getCurrentWeather':
                    endpointParams += `&current=temperature_2m,relative_humidity_2m,apparent_temperature,precipitation,weather_code,wind_speed_10m`;
                    break;
                case 'getForecast':
                    const forecastDays = Math.min(Math.max(days, 1), 14); // Open-Meteo limits to 14 days
                    endpointParams += `&daily=weather_code,temperature_2m_max,temperature_2m_min,apparent_temperature_max,apparent_temperature_min,sunrise,sunset,uv_index_max,precipitation_sum&forecast_days=${forecastDays}`;
                    break;
                default:
                    return { success: false, error: `Unsupported Weather action: ${action}` };
            }

            const { data } = await axios.get(`${this.weatherUrl}${endpointParams}`, { timeout: 10000 });

            // Format output for the LLM
            let resultString = `Weather Report for ${coords.name}, ${coords.country}:\n`;
            if (action === 'getCurrentWeather' && data.current) {
                resultString += `Time: ${data.current.time}\n`;
                resultString += `Temperature: ${data.current.temperature_2m}${data.current_units.temperature_2m}\n`;
                resultString += `Feels Like: ${data.current.apparent_temperature}${data.current_units.apparent_temperature}\n`;
                resultString += `Humidity: ${data.current.relative_humidity_2m}${data.current_units.relative_humidity_2m}\n`;
                resultString += `Wind Speed: ${data.current.wind_speed_10m}${data.current_units.wind_speed_10m}\n`;
                resultString += `Precipitation: ${data.current.precipitation}${data.current_units.precipitation}\n`;
                resultString += `WMO Weather Code: ${data.current.weather_code}\n`;
            } else if (action === 'getForecast' && data.daily) {
                for (let i = 0; i < data.daily.time.length; i++) {
                    resultString += `\nDate: ${data.daily.time[i]}\n`;
                    resultString += `  Max Temp: ${data.daily.temperature_2m_max[i]}${data.daily_units.temperature_2m_max}\n`;
                    resultString += `  Min Temp: ${data.daily.temperature_2m_min[i]}${data.daily_units.temperature_2m_min}\n`;
                    resultString += `  Precipitation Sum: ${data.daily.precipitation_sum[i]}${data.daily_units.precipitation_sum}\n`;
                    resultString += `  Max UV Index: ${data.daily.uv_index_max[i]}\n`;
                    resultString += `  WMO Weather Code: ${data.daily.weather_code[i]}\n`;
                }
            }

            return { success: true, payload: resultString };

        } catch (err) {
            logger.error(`[WeatherSkill] Execution failed: ${err.message}`);
            return { success: false, error: err.message };
        }
    }

    async _getCoordinates(cityName) {
        try {
            const { data } = await axios.get(`${this.geocodingUrl}?name=${encodeURIComponent(cityName)}&count=1&language=en&format=json`);
            if (data.results && data.results.length > 0) {
                const loc = data.results[0];
                return { latitude: loc.latitude, longitude: loc.longitude, name: loc.name, country: loc.country };
            }
            return null;
        } catch (error) {
            throw new Error(`Geocoding API failed: ${error.message}`);
        }
    }
}

export default new WeatherSkill();
