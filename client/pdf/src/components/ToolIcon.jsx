import {
  FiArchive,
  FiFileText,
  FiGrid,
  FiImage,
  FiLayers,
  FiMonitor,
} from "react-icons/fi";

const icons = {
  archive: FiArchive,
  file: FiFileText,
  grid: FiGrid,
  image: FiImage,
  layers: FiLayers,
  monitor: FiMonitor,
};

export default function ToolIcon({ name, className = "" }) {
  const Icon = icons[name] || FiFileText;
  return <Icon className={className} aria-hidden="true" />;
}
