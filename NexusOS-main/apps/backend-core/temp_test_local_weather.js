import weatherSkill from './src/skills/weatherSkill.js';

async function verifyWeather() {
    console.log("--- ⛅ Testing Native Weather Skill ---");

    console.log("\n1. Fetching Current Weather for 'Cairo'...");
    const currentResult = await weatherSkill.executeIntent({ action: 'getCurrentWeather', location: 'Cairo' });
    console.log(currentResult.payload ? currentResult.payload : currentResult);

    console.log("\n2. Fetching 3-Day Forecast for 'London'...");
    const forecastResult = await weatherSkill.executeIntent({ action: 'getForecast', location: 'London', days: 3 });
    console.log(forecastResult.payload ? forecastResult.payload : forecastResult);

    console.log("\n✅ Weather Local Diagnostic Complete.");
    process.exit(0);
}

verifyWeather();
