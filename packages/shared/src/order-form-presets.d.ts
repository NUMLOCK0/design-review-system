/** Business form starters adapted from the supplied chat demo. Demo sample answers are deliberately omitted. */
import { type FormTemplate } from './form-config';
export interface OrderFormPreset {
    id: string;
    name: string;
    tag: string;
    category: string;
    description: string;
    sections: Array<{
        title: string;
        fields: Array<{
            key: string;
            label: string;
            kind: 'text' | 'textarea' | 'select';
            required?: boolean;
            placeholder?: string;
            options?: string[];
            presets?: string[];
        }>;
    }>;
}
export declare const ORDER_FORM_PRESETS: OrderFormPreset[];
export declare function createOrderPresetDraft(preset: OrderFormPreset): FormTemplate;
