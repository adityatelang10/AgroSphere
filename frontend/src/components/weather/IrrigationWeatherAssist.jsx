import FarmWeatherControls from "./FarmWeatherControls";

export default function IrrigationWeatherAssist({ disabled, onWeatherLoaded }) {
  return <FarmWeatherControls disabled={disabled} onWeatherLoaded={onWeatherLoaded} irrigation />;
}
