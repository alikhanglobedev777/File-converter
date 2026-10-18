import { Link } from "react-router-dom";
import { FiArrowUpRight } from "react-icons/fi";
import ToolIcon from "./ToolIcon";

export default function ToolCard({ tool, compact = false }) {
  return (
    <Link className={`tool-card ${compact ? "tool-card--compact" : ""}`} to={`/${tool.id}`}>
      <div className="tool-card__top">
        <span className="tool-card__icon"><ToolIcon name={tool.icon} /></span>
        <span className="tool-card__arrow" aria-hidden="true"><FiArrowUpRight /></span>
      </div>
      <span className="tool-card__type">{tool.from} <span aria-hidden="true">→</span> {tool.to}</span>
      <h3>{tool.title}</h3>
      <p>{tool.description}</p>
      <span className="tool-card__link">Open tool <FiArrowUpRight aria-hidden="true" /></span>
    </Link>
  );
}
