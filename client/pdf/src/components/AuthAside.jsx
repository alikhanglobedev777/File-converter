import { Link } from "react-router-dom";
import { FiArrowRight, FiCheck, FiFileText, FiGrid, FiLayers } from "react-icons/fi";

export default function AuthAside() {
  return <aside className="auth-aside"><span className="eyebrow eyebrow--light">ONE PLACE FOR ALL YOUR FILES</span><h2>Good work starts with a simpler workflow.</h2><p>Go from one file format to another without juggling different tools.</p><div className="auth-aside__visual" aria-hidden="true"><span className="auth-aside__tile"><FiFileText />PDF</span><span className="auth-aside__arrow"><FiArrowRight /></span><span className="auth-aside__tile"><FiGrid />XLSX</span><span className="auth-aside__mini"><FiLayers /> 9 tools</span></div><div className="auth-aside__checks"><span><FiCheck /> Easy conversion tools</span><span><FiCheck /> Fast access to all tools</span></div><Link to="/" className="auth-aside__link">Browse tools without an account <FiArrowRight /></Link></aside>;
}
