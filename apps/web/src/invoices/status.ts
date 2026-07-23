import type { IconDefinition } from '@fortawesome/fontawesome-svg-core';
import {
  faCircleCheck,
  faFileInvoice,
  faPaperPlane,
  faReceipt,
} from '@fortawesome/free-solid-svg-icons';

/** The derived invoice workflow status (see the backend's invoices.ts). */
export type WorkflowStatus = 'offen' | 'eingereicht' | 'abgerechnet' | 'erledigt';

export interface StatusDisplay {
  /** Maps 1:1 to EuBadge tones. */
  tone: 'open' | 'submitted' | 'billed' | 'done';
  label: string;
  icon: IconDefinition;
}

export const STATUS_ORDER: WorkflowStatus[] = ['offen', 'eingereicht', 'abgerechnet', 'erledigt'];

export const STATUS_DISPLAY: Record<WorkflowStatus, StatusDisplay> = {
  offen: { tone: 'open', label: 'Offen', icon: faFileInvoice },
  eingereicht: { tone: 'submitted', label: 'Eingereicht', icon: faPaperPlane },
  abgerechnet: { tone: 'billed', label: 'Abgerechnet', icon: faReceipt },
  erledigt: { tone: 'done', label: 'Erledigt', icon: faCircleCheck },
};
