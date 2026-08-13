import React, { useState } from 'react';
import { createPortal } from 'react-dom';
import {
  Layers,
  PlusCircle,
  Edit3,
  Trash2,
  ChevronUp,
  ChevronDown,
  X,
  Upload,
  FileText
} from 'lucide-react';
import { DynamicCustomField } from '../types';

export interface DynamicFieldSectionProps {
  target: 'student' | 'teacher' | 'financial';
  customFields: DynamicCustomField[];
  onAddCustomField: (field: DynamicCustomField) => void;
  onUpdateCustomField: (field: DynamicCustomField) => void;
  onDeleteCustomField: (fieldId: string) => void;
  onReorderCustomFields: (orderedIds: string[]) => void;
  values: Record<string, any>;
  onValuesChange: (values: Record<string, any>) => void;
  readOnlyValues?: boolean;
  showFieldManager?: boolean;
  sectionTitle?: string;
  onNotify?: (message: string) => void;
}

export function validateDynamicFieldValues(
  fields: DynamicCustomField[],
  values: Record<string, any>
): string | null {
  for (const field of fields) {
    if (!field.isRequired) continue;
    const val = values[field.fieldName];
    if (val === undefined || val === null || String(val).trim() === '') {
      return `Required field "${field.fieldName}" must be filled.`;
    }
  }
  return null;
}

export const DynamicFieldSection: React.FC<DynamicFieldSectionProps> = ({
  target,
  customFields,
  onAddCustomField,
  onUpdateCustomField,
  onDeleteCustomField,
  onReorderCustomFields,
  values,
  onValuesChange,
  readOnlyValues = false,
  showFieldManager = true,
  sectionTitle = 'Dynamic Custom Fields',
  onNotify
}) => {
  const targetFields = customFields.filter(f => f.target === target);

  const [showModal, setShowModal] = useState(false);
  const [editingField, setEditingField] = useState<DynamicCustomField | null>(null);
  const [fieldName, setFieldName] = useState('');
  const [fieldType, setFieldType] = useState<'text' | 'numeric' | 'file'>('text');
  const [isRequired, setIsRequired] = useState(false);
  const [modalError, setModalError] = useState<string | null>(null);

  const notify = (message: string) => {
    onNotify?.(message);
  };

  const openAddModal = () => {
    setEditingField(null);
    setFieldName('');
    setFieldType('text');
    setIsRequired(false);
    setModalError(null);
    setShowModal(true);
  };

  const openEditModal = (field: DynamicCustomField) => {
    setEditingField(field);
    setFieldName(field.fieldName);
    setFieldType(field.fieldType);
    setIsRequired(!!field.isRequired);
    setModalError(null);
    setShowModal(true);
  };

  const closeModal = () => {
    setShowModal(false);
    setEditingField(null);
    setModalError(null);
  };

  const saveField = () => {
    const trimmedName = fieldName.trim();
    if (!trimmedName) {
      setModalError('Field name is required.');
      return;
    }

    const duplicate = targetFields.some(
      f => f.fieldName.toLowerCase() === trimmedName.toLowerCase() && f.id !== editingField?.id
    );
    if (duplicate) {
      setModalError(`A field named "${trimmedName}" already exists for this form.`);
      return;
    }

    if (editingField) {
      const oldName = editingField.fieldName;
      const updated: DynamicCustomField = {
        ...editingField,
        fieldName: trimmedName,
        fieldType,
        isRequired
      };
      onUpdateCustomField(updated);

      if (oldName !== trimmedName && values[oldName] !== undefined) {
        const next = { ...values };
        next[trimmedName] = next[oldName];
        delete next[oldName];
        onValuesChange(next);
      }

      notify(`Field "${trimmedName}" updated successfully.`);
    } else {
      const newField: DynamicCustomField = {
        id: 'field-' + Date.now(),
        target,
        fieldName: trimmedName,
        fieldType,
        isRequired
      };
      onAddCustomField(newField);
      notify(`Field "${trimmedName}" added successfully.`);
    }

    closeModal();
  };

  const handleDeleteField = (field: DynamicCustomField) => {
    if (!window.confirm(`Delete custom field "${field.fieldName}"? Existing saved values will remain in records but won't appear on forms.`)) {
      return;
    }
    onDeleteCustomField(field.id);
    if (values[field.fieldName] !== undefined) {
      const next = { ...values };
      delete next[field.fieldName];
      onValuesChange(next);
    }
    notify(`Field "${field.fieldName}" deleted.`);
  };

  const moveField = (index: number, direction: -1 | 1) => {
    const newIndex = index + direction;
    if (newIndex < 0 || newIndex >= targetFields.length) return;
    const ids = targetFields.map(f => f.id);
    [ids[index], ids[newIndex]] = [ids[newIndex], ids[index]];
    onReorderCustomFields(ids);
  };

  const handleFileUpload = (fieldNameKey: string, e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (event) => {
      if (event.target?.result) {
        onValuesChange({ ...values, [fieldNameKey]: event.target.result as string });
        notify(`File "${file.name}" attached to "${fieldNameKey}".`);
      }
    };
    reader.readAsDataURL(file);
  };

  const updateValue = (key: string, val: any) => {
    onValuesChange({ ...values, [key]: val });
  };

  return (
    <div className="border-t border-slate-200 pt-4 space-y-4">
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-black uppercase text-blue-900 tracking-wider flex items-center gap-2">
          <Layers className="w-4 h-4 text-blue-700" />
          {sectionTitle}
        </h3>
        {showFieldManager && (
          <button
            type="button"
            onClick={e => {
              e.preventDefault();
              e.stopPropagation();
              openAddModal();
            }}
            className="px-3 py-1.5 bg-indigo-50 hover:bg-indigo-100 text-indigo-700 text-xs font-bold rounded-lg border border-indigo-200 flex items-center gap-1.5 transition-all"
          >
            <PlusCircle className="w-4 h-4" />
            Add Field
          </button>
        )}
      </div>

      {showFieldManager && targetFields.length > 0 && (
        <div className="bg-indigo-50/50 p-3 rounded-xl border border-indigo-200 space-y-2">
          <p className="text-[10px] font-bold text-indigo-800 uppercase tracking-wider">Field Schema Manager</p>
          {targetFields.map((field, index) => (
            <div
              key={field.id}
              className="flex items-center gap-2 bg-white p-2 rounded-lg border border-indigo-100"
            >
              <div className="flex flex-col gap-0.5">
                <button
                  type="button"
                  disabled={index === 0}
                  onClick={() => moveField(index, -1)}
                  className="p-0.5 text-slate-400 hover:text-indigo-700 disabled:opacity-30"
                  title="Move up"
                >
                  <ChevronUp className="w-3.5 h-3.5" />
                </button>
                <button
                  type="button"
                  disabled={index === targetFields.length - 1}
                  onClick={() => moveField(index, 1)}
                  className="p-0.5 text-slate-400 hover:text-indigo-700 disabled:opacity-30"
                  title="Move down"
                >
                  <ChevronDown className="w-3.5 h-3.5" />
                </button>
              </div>
              <div className="flex-1 min-w-0">
                <span className="text-xs font-bold text-slate-800">{field.fieldName}</span>
                <span className="text-[10px] text-indigo-600 ml-2">
                  ({field.fieldType}{field.isRequired ? ', required' : ''})
                </span>
              </div>
              <button
                type="button"
                onClick={() => openEditModal(field)}
                className="p-1.5 text-amber-700 hover:bg-amber-50 rounded-lg"
                title="Edit field"
              >
                <Edit3 className="w-3.5 h-3.5" />
              </button>
              <button
                type="button"
                onClick={() => handleDeleteField(field)}
                className="p-1.5 text-red-600 hover:bg-red-50 rounded-lg"
                title="Delete field"
              >
                <Trash2 className="w-3.5 h-3.5" />
              </button>
            </div>
          ))}
        </div>
      )}

      {targetFields.length > 0 ? (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4 bg-slate-50 p-4 rounded-xl border border-slate-200">
          {targetFields.map(field => (
            <div key={field.id}>
              <label className="block text-xs font-bold text-slate-700 mb-1">
                {field.fieldName}
                {field.isRequired && <span className="text-red-600 ml-0.5">*</span>}
                <span className="text-[10px] text-indigo-600 font-normal ml-1">({field.fieldType})</span>
              </label>

              {readOnlyValues ? (
                <div className="px-3 py-2 rounded-xl border border-slate-200 bg-white text-sm text-slate-800 min-h-[38px]">
                  {field.fieldType === 'file' && values[field.fieldName] ? (
                    <span className="text-xs text-emerald-700 font-bold flex items-center gap-1">
                      <FileText className="w-3.5 h-3.5" /> File attached
                    </span>
                  ) : (
                    values[field.fieldName] ?? <span className="text-slate-400 italic">—</span>
                  )}
                </div>
              ) : field.fieldType === 'file' ? (
                <div className="space-y-1">
                  {values[field.fieldName] && (
                    <span className="text-[10px] text-emerald-700 font-bold flex items-center gap-1">
                      <FileText className="w-3 h-3" /> File attached
                    </span>
                  )}
                  <label className="inline-flex items-center gap-1.5 px-3 py-2 bg-blue-900 hover:bg-blue-800 text-white text-xs font-bold rounded-xl cursor-pointer">
                    <Upload className="w-3.5 h-3.5" />
                    {values[field.fieldName] ? 'Replace File' : 'Upload File'}
                    <input
                      type="file"
                      accept="application/pdf,.pdf,image/jpeg,image/png,image/webp,image/gif,image/*"
                      onChange={e => handleFileUpload(field.fieldName, e)}
                      className="hidden"
                    />
                  </label>
                </div>
              ) : (
                <input
                  type={field.fieldType === 'numeric' ? 'number' : 'text'}
                  value={values[field.fieldName] ?? ''}
                  onChange={e => updateValue(field.fieldName, e.target.value)}
                  placeholder={`Enter ${field.fieldName}`}
                  required={field.isRequired}
                  className="w-full px-3 py-2 rounded-xl border border-slate-300 text-sm focus:ring-2 focus:ring-blue-800 bg-white"
                />
              )}
            </div>
          ))}
        </div>
      ) : (
        <p className="text-xs text-slate-500 italic bg-slate-50 p-3 rounded-xl border border-dashed border-slate-300">
          No custom fields defined yet. Click &quot;Add Field&quot; to create dynamic form attributes.
        </p>
      )}

      {showModal && createPortal(
        <div
          className="fixed inset-0 z-[120] flex items-center justify-center bg-slate-900/70 p-4 backdrop-blur-sm"
          onClick={closeModal}
        >
          <div
            className="w-full max-w-md bg-white rounded-2xl shadow-2xl p-6 border border-slate-200 space-y-4"
            onClick={e => e.stopPropagation()}
          >
            <div className="flex justify-between items-center">
              <h3 className="text-lg font-bold text-slate-900 flex items-center gap-2">
                {editingField ? <Edit3 className="w-5 h-5 text-amber-600" /> : <PlusCircle className="w-5 h-5 text-indigo-600" />}
                {editingField ? 'Edit Custom Field' : 'Add Custom Field'}
              </h3>
              <button type="button" onClick={closeModal} className="text-slate-400 hover:text-slate-600">
                <X className="w-5 h-5" />
              </button>
            </div>

            {modalError && (
              <p className="text-xs font-bold text-red-600 bg-red-50 p-2 rounded-lg">{modalError}</p>
            )}

            <div className="space-y-4">
              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1">Field Label Name</label>
                <input
                  type="text"
                  value={fieldName}
                  onChange={e => setFieldName(e.target.value)}
                  onKeyDown={e => {
                    if (e.key === 'Enter') {
                      e.preventDefault();
                      e.stopPropagation();
                      saveField();
                    }
                  }}
                  placeholder="e.g. Scholarship Code, Bus Route"
                  className="w-full px-3 py-2 rounded-xl border border-slate-300 text-sm focus:ring-2 focus:ring-indigo-600"
                />
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1">Field Type</label>
                <select
                  value={fieldType}
                  onChange={e => setFieldType(e.target.value as 'text' | 'numeric' | 'file')}
                  className="w-full px-3 py-2 rounded-xl border border-slate-300 text-sm focus:ring-2 focus:ring-indigo-600"
                >
                  <option value="text">Text String</option>
                  <option value="numeric">Numeric Number</option>
                  <option value="file">File Upload</option>
                </select>
              </div>

              <label className="flex items-center gap-2 cursor-pointer">
                <input
                  type="checkbox"
                  checked={isRequired}
                  onChange={e => setIsRequired(e.target.checked)}
                  className="rounded border-slate-300 text-indigo-600 focus:ring-indigo-600"
                />
                <span className="text-xs font-bold text-slate-700">Required field</span>
              </label>

              <div className="flex gap-2 pt-2">
                <button
                  type="button"
                  onClick={closeModal}
                  className="flex-1 px-4 py-2 border rounded-xl text-xs font-bold text-slate-700 hover:bg-slate-100"
                >
                  Cancel
                </button>
                <button
                  type="button"
                  onClick={e => {
                    e.preventDefault();
                    e.stopPropagation();
                    saveField();
                  }}
                  className="flex-1 px-4 py-2 bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-bold rounded-xl shadow-lg"
                >
                  {editingField ? 'Save Changes' : 'Add Field'}
                </button>
              </div>
            </div>
          </div>
        </div>,
        document.body
      )}
    </div>
  );
};
