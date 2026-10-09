import React from 'react';
import { FileEdit, Calendar, PlayCircle, CheckCircle2, Lock, HelpCircle } from 'lucide-react';
import styles from './AuditStatusIcon.module.css';

interface AuditStatusIconProps {
  status: string;
  auditNo: string;
  title: string;
  onClick?: () => void;
}

const AuditStatusIcon: React.FC<AuditStatusIconProps> = ({ status, auditNo, title, onClick }) => {
  const getStatusConfig = () => {
    switch (status) {
      case 'Draft':
        return { icon: FileEdit, className: styles.draft };
      case 'Planned':
        return { icon: Calendar, className: styles.planned };
      case 'In Progress':
        return { icon: PlayCircle, className: styles.inProgress };
      case 'Completed':
        return { icon: CheckCircle2, className: styles.completed };
      case 'Closed':
        return { icon: Lock, className: styles.closed };
      default:
        return { icon: HelpCircle, className: styles.unknown };
    }
  };

  const { icon: Icon, className } = getStatusConfig();
  return (
    <div
      className={`${styles.container} ${className}`}
      title={`${auditNo}: ${title}`}
      onClick={onClick}
      role="button"
      tabIndex={0}
      onKeyDown={(e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          onClick?.();
        }
      }}
    >
      <div className={styles.iconWrapper}>
        <Icon className={styles.iconSvg} />
      </div>
      <div className={styles.tooltipCard}>
        <p className={styles.ttAuditNo}>{auditNo}</p>
        <p className={styles.ttTitle}>{title}</p>
        <span className={styles.ttStatus}>{status}</span>
      </div>
    </div>
  );
};

export default AuditStatusIcon;
