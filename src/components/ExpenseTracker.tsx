import React, { useState, useRef } from 'react';
import { 
  Receipt, 
  Plus, 
  Search, 
  Calendar, 
  DollarSign, 
  TrendingDown, 
  PieChart, 
  Filter, 
  Download, 
  Trash2, 
  Edit3, 
  CheckCircle2, 
  AlertCircle, 
  X, 
  Wallet,
  Tag,
  Building2,
  FileSpreadsheet,
  Scan,
  Sparkles,
  Camera,
  Loader2,
  Eye,
  Upload,
  FileText
} from 'lucide-react';
import { Expense, DynamicCustomField } from '../types';
import { DocumentPreviewModal } from './DocumentPreviewModal';
import { DynamicFieldSection, validateDynamicFieldValues } from './DynamicFieldSection';

interface ExpenseTrackerProps {
  expenses: Expense[];
  onSaveExpense: (expense: Expense) => void;
  onUpdateExpense: (expense: Expense) => void;
  onDeleteExpense: (expenseId: string) => void;
  customFields: DynamicCustomField[];
  onAddCustomField: (field: DynamicCustomField) => void;
  onUpdateCustomField: (field: DynamicCustomField) => void;
  onDeleteCustomField: (fieldId: string) => void;
  onReorderCustomFields: (orderedIds: string[]) => void;
}

const DEFAULT_CATEGORIES = [
  'Utilities & Power',
  'IT Infrastructure',
  'Campus Maintenance',
  'Salaries & Wages',
  'Stationery & Printing',
  'Events & Celebrations',
  'Transport & Fuel',
  'Lab & Sports Equipment',
  'Miscellaneous'
];

const DEFAULT_PAYMENT_MODES = [
  'Cash',
  'Bank Transfer',
  'Cheque',
  'Online / POS',
  'Corporate Card'
];

export const ExpenseTracker: React.FC<ExpenseTrackerProps> = ({
  expenses,
  onSaveExpense,
  onUpdateExpense,
  onDeleteExpense,
  customFields,
  onAddCustomField,
  onUpdateCustomField,
  onDeleteCustomField,
  onReorderCustomFields
}) => {
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedCategory, setSelectedCategory] = useState<string>('ALL');
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingExpense, setEditingExpense] = useState<Expense | null>(null);

  // Dynamic Custom Categories & Payment Modes State
  const [categoriesList, setCategoriesList] = useState<string[]>(() => {
    const saved = localStorage.getItem('uss_custom_expense_categories');
    if (saved) {
      try { return JSON.parse(saved); } catch {}
    }
    return DEFAULT_CATEGORIES;
  });

  const [paymentModesList, setPaymentModesList] = useState<string[]>(() => {
    const saved = localStorage.getItem('uss_custom_payment_modes');
    if (saved) {
      try { return JSON.parse(saved); } catch {}
    }
    return DEFAULT_PAYMENT_MODES;
  });

  // Inline Custom Adder Controls
  const [isAddingNewPaymentMode, setIsAddingNewPaymentMode] = useState(false);
  const [newPaymentModeInput, setNewPaymentModeInput] = useState('');
  const [isAddingNewCategory, setIsAddingNewCategory] = useState(false);
  const [newCategoryInput, setNewCategoryInput] = useState('');

  // Form State
  const [date, setDate] = useState(new Date().toISOString().slice(0, 10));
  const [category, setCategory] = useState(categoriesList[0] || 'Utilities & Power');
  const [amount, setAmount] = useState('');
  const [description, setDescription] = useState('');
  const [paymentMode, setPaymentMode] = useState(paymentModesList[0] || 'Cash');
  const [loggedBy, setLoggedBy] = useState('Abdul Rehman Jamil');
  const [receiptUrl, setReceiptUrl] = useState<string>('');
  const [expenseCustomFields, setExpenseCustomFields] = useState<Record<string, any>>({});
  const [statusMsg, setStatusMsg] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

  // Receipt Preview Modal State
  const [previewModal, setPreviewModal] = useState<{ title: string; url: string } | null>(null);

  // Receipt Scanner State
  const [isScanning, setIsScanning] = useState(false);
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  // Quick Analytics
  const totalAmount = expenses.reduce((sum, item) => sum + (Number(item.amount) || 0), 0);
  
  const currentMonthStr = new Date().toISOString().slice(0, 7); // YYYY-MM
  const thisMonthExpenses = expenses.filter(e => e.date && e.date.startsWith(currentMonthStr));
  const thisMonthTotal = thisMonthExpenses.reduce((sum, item) => sum + (Number(item.amount) || 0), 0);

  // Category Breakdown
  const categoryTotals = expenses.reduce((acc, curr) => {
    const cat = curr.category || 'Miscellaneous';
    acc[cat] = (acc[cat] || 0) + (Number(curr.amount) || 0);
    return acc;
  }, {} as Record<string, number>);

  const sortedCategories = Object.entries(categoryTotals).sort((a, b) => Number(b[1]) - Number(a[1]));
  const topCategory = sortedCategories[0] ? sortedCategories[0][0] : 'N/A';

  // Filtered List
  const filteredExpenses = expenses.filter(item => {
    const matchesSearch = 
      item.description.toLowerCase().includes(searchTerm.toLowerCase()) ||
      item.category.toLowerCase().includes(searchTerm.toLowerCase()) ||
      item.logged_by.toLowerCase().includes(searchTerm.toLowerCase()) ||
      item.payment_mode.toLowerCase().includes(searchTerm.toLowerCase());
    const matchesCategory = selectedCategory === 'ALL' || item.category === selectedCategory;
    return matchesSearch && matchesCategory;
  });

  const handleOpenAdd = () => {
    setEditingExpense(null);
    setDate(new Date().toISOString().slice(0, 10));
    setCategory(categoriesList[0] || 'Utilities & Power');
    setAmount('');
    setDescription('');
    setPaymentMode(paymentModesList[0] || 'Cash');
    setLoggedBy('Abdul Rehman Jamil');
    setReceiptUrl('');
    setExpenseCustomFields({});
    setIsModalOpen(true);
  };

  const handleOpenEdit = (item: Expense) => {
    setEditingExpense(item);
    setDate(item.date);
    setCategory(item.category);
    setAmount(String(item.amount));
    setDescription(item.description);
    setPaymentMode(item.payment_mode);
    setLoggedBy(item.logged_by || 'Abdul Rehman Jamil');
    setReceiptUrl(item.receipt_url || '');
    setExpenseCustomFields(item.custom_fields || {});
    setIsModalOpen(true);
  };

  // Add Custom Payment Mode
  const handleAddCustomPaymentMode = () => {
    const trimmed = newPaymentModeInput.trim();
    if (!trimmed) return;
    if (!paymentModesList.includes(trimmed)) {
      const updated = [...paymentModesList, trimmed];
      setPaymentModesList(updated);
      localStorage.setItem('uss_custom_payment_modes', JSON.stringify(updated));
    }
    setPaymentMode(trimmed);
    setNewPaymentModeInput('');
    setIsAddingNewPaymentMode(false);
  };

  // Add Custom Category
  const handleAddCustomCategory = () => {
    const trimmed = newCategoryInput.trim();
    if (!trimmed) return;
    if (!categoriesList.includes(trimmed)) {
      const updated = [...categoriesList, trimmed];
      setCategoriesList(updated);
      localStorage.setItem('uss_custom_expense_categories', JSON.stringify(updated));
    }
    setCategory(trimmed);
    setNewCategoryInput('');
    setIsAddingNewCategory(false);
  };

  // Receipt Image Scan Handler via Gemini API
  const handleReceiptScanClick = () => {
    fileInputRef.current?.click();
  };

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setIsScanning(true);
    setStatusMsg({ type: 'success', text: 'Scanning receipt image with Gemini AI OCR Engine...' });

    const reader = new FileReader();
    reader.onload = async (event) => {
      const base64 = event.target?.result as string;
      try {
        const res = await fetch('/api/expense/scan-receipt', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            imageBase64: base64,
            mimeType: file.type || 'image/png'
          })
        });

        const data = await res.json();
        if (res.ok && data.data) {
          const scanned = data.data;

          // Ensure payment mode & category exist in lists
          if (scanned.payment_mode && !paymentModesList.includes(scanned.payment_mode)) {
            const updatedPM = [...paymentModesList, scanned.payment_mode];
            setPaymentModesList(updatedPM);
            localStorage.setItem('uss_custom_payment_modes', JSON.stringify(updatedPM));
          }
          if (scanned.category && !categoriesList.includes(scanned.category)) {
            const updatedCat = [...categoriesList, scanned.category];
            setCategoriesList(updatedCat);
            localStorage.setItem('uss_custom_expense_categories', JSON.stringify(updatedCat));
          }

          // Populate Modal Form
          setEditingExpense(null);
          setDate(scanned.date || new Date().toISOString().slice(0, 10));
          setAmount(String(scanned.amount || ''));
          setCategory(scanned.category || categoriesList[0]);
          setDescription(scanned.description || 'Scanned Receipt Expense');
          setPaymentMode(scanned.payment_mode || paymentModesList[0]);
          setLoggedBy('Abdul Rehman Jamil');
          setReceiptUrl(base64);

          setIsModalOpen(true);
          setStatusMsg({
            type: 'success',
            text: `Receipt scanned! Verified Amount: PKR ${Number(scanned.amount).toLocaleString()} (${data.source})`
          });
        } else {
          setStatusMsg({ type: 'error', text: data.error || 'Failed to parse receipt image.' });
        }
      } catch (err: any) {
        setStatusMsg({ type: 'error', text: `Scan error: ${err.message}` });
      } finally {
        setIsScanning(false);
        if (fileInputRef.current) fileInputRef.current.value = '';
      }
    };
    reader.readAsDataURL(file);
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!amount || Number(amount) <= 0 || !description.trim()) {
      setStatusMsg({ type: 'error', text: 'Please enter a valid expense amount and description.' });
      return;
    }

    const financialFields = customFields.filter(f => f.target === 'financial');
    const fieldValidationError = validateDynamicFieldValues(financialFields, expenseCustomFields);
    if (fieldValidationError) {
      setStatusMsg({ type: 'error', text: fieldValidationError });
      return;
    }

    if (editingExpense) {
      const updated: Expense = {
        ...editingExpense,
        date,
        category,
        amount: Number(amount),
        description: description.trim(),
        payment_mode: paymentMode,
        logged_by: loggedBy.trim(),
        receipt_url: receiptUrl || undefined,
        custom_fields: expenseCustomFields
      };
      onUpdateExpense(updated);
      setStatusMsg({ type: 'success', text: 'Expense entry updated successfully & synced to MongoDB Atlas!' });
    } else {
      const newExp: Expense = {
        id: 'exp-' + Date.now(),
        date,
        category,
        amount: Number(amount),
        description: description.trim(),
        payment_mode: paymentMode,
        logged_by: loggedBy.trim(),
        receipt_url: receiptUrl || undefined,
        custom_fields: expenseCustomFields,
        created_at: new Date().toISOString()
      };
      onSaveExpense(newExp);
      setStatusMsg({ type: 'success', text: 'New expense logged and synced to MongoDB Atlas & Supabase!' });
    }

    setTimeout(() => {
      setIsModalOpen(false);
      setStatusMsg(null);
    }, 800);
  };

  const handleExportCSV = () => {
    const headers = ['ID', 'Date', 'Category', 'Amount (PKR)', 'Payment Mode', 'Description', 'Logged By'];
    const rows = filteredExpenses.map(e => [
      e.id,
      e.date,
      `"${e.category}"`,
      e.amount,
      `"${e.payment_mode}"`,
      `"${e.description.replace(/"/g, '""')}"`,
      `"${e.logged_by}"`
    ]);

    const csvContent = 'data:text/csv;charset=utf-8,' + [headers.join(','), ...rows.map(r => r.join(','))].join('\n');
    const encodedUri = encodeURI(csvContent);
    const link = document.createElement('a');
    link.setAttribute('href', encodedUri);
    link.setAttribute('download', `Expense_Report_${new Date().toISOString().slice(0, 10)}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 space-y-6">
      
      {/* Hidden File Input for Receipt Scanner */}
      <input
        type="file"
        ref={fileInputRef}
        accept="image/*"
        onChange={handleFileChange}
        className="hidden"
      />

      {/* Top Banner Header */}
      <div className="bg-gradient-to-r from-slate-900 via-indigo-950 to-slate-900 rounded-2xl p-6 text-white shadow-xl border border-slate-800 flex flex-col md:flex-row items-start md:items-center justify-between gap-4">
        <div className="space-y-1">
          <div className="flex items-center gap-2">
            <span className="p-2 bg-indigo-500/20 text-indigo-300 rounded-xl border border-indigo-400/30">
              <Receipt className="w-6 h-6" />
            </span>
            <h2 className="text-xl font-black uppercase tracking-wide">OPERATIONAL EXPENSE TRACKER</h2>
          </div>
          <p className="text-xs text-slate-300">
            Real-time audit log of campus expenditures, utility bills & operational disbursements (Saved in MongoDB Atlas & Supabase).
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-3">
          {/* AI Scan Receipt Button */}
          <button
            onClick={handleReceiptScanClick}
            disabled={isScanning}
            className="flex items-center gap-2 px-4 py-2.5 bg-gradient-to-r from-purple-600 to-indigo-600 hover:from-purple-500 hover:to-indigo-500 text-white text-xs font-bold rounded-xl shadow-lg shadow-purple-600/30 transition disabled:opacity-50"
          >
            {isScanning ? (
              <Loader2 className="w-4 h-4 animate-spin text-purple-200" />
            ) : (
              <Scan className="w-4 h-4 text-amber-300" />
            )}
            {isScanning ? 'Scanning Receipt...' : 'Scan Receipt (AI OCR)'}
          </button>

          <button
            onClick={handleExportCSV}
            className="flex items-center gap-2 px-4 py-2.5 bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs font-bold rounded-xl border border-slate-700 transition"
          >
            <FileSpreadsheet className="w-4 h-4 text-emerald-400" />
            Export CSV
          </button>
          
          <button
            onClick={handleOpenAdd}
            className="flex items-center gap-2 px-4 py-2.5 bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-bold rounded-xl shadow-lg shadow-indigo-600/30 transition"
          >
            <Plus className="w-4 h-4" />
            Log New Expense
          </button>
        </div>
      </div>

      {/* KPI Stats Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        
        <div className="bg-white p-5 rounded-2xl border border-slate-200 shadow-sm space-y-2">
          <div className="flex items-center justify-between text-slate-500">
            <span className="text-xs font-bold uppercase tracking-wider">Total Expenses Logged</span>
            <div className="p-2 bg-rose-50 rounded-xl text-rose-600">
              <TrendingDown className="w-4 h-4" />
            </div>
          </div>
          <div className="text-2xl font-black text-slate-900">
            PKR {totalAmount.toLocaleString()}
          </div>
          <p className="text-[11px] text-slate-500">{expenses.length} Total records on file</p>
        </div>

        <div className="bg-white p-5 rounded-2xl border border-slate-200 shadow-sm space-y-2">
          <div className="flex items-center justify-between text-slate-500">
            <span className="text-xs font-bold uppercase tracking-wider">This Month's Spending</span>
            <div className="p-2 bg-amber-50 rounded-xl text-amber-600">
              <Calendar className="w-4 h-4" />
            </div>
          </div>
          <div className="text-2xl font-black text-slate-900">
            PKR {thisMonthTotal.toLocaleString()}
          </div>
          <p className="text-[11px] text-slate-500">{thisMonthExpenses.length} Entries in current month</p>
        </div>

        <div className="bg-white p-5 rounded-2xl border border-slate-200 shadow-sm space-y-2">
          <div className="flex items-center justify-between text-slate-500">
            <span className="text-xs font-bold uppercase tracking-wider">Top Expense Category</span>
            <div className="p-2 bg-blue-50 rounded-xl text-blue-600">
              <PieChart className="w-4 h-4" />
            </div>
          </div>
          <div className="text-lg font-black text-slate-900 truncate">
            {topCategory}
          </div>
          <p className="text-[11px] text-slate-500">
            PKR {(categoryTotals[topCategory] || 0).toLocaleString()} spent
          </p>
        </div>

        <div className="bg-white p-5 rounded-2xl border border-slate-200 shadow-sm space-y-2">
          <div className="flex items-center justify-between text-slate-500">
            <span className="text-xs font-bold uppercase tracking-wider">Avg Transaction Size</span>
            <div className="p-2 bg-emerald-50 rounded-xl text-emerald-600">
              <Wallet className="w-4 h-4" />
            </div>
          </div>
          <div className="text-2xl font-black text-slate-900">
            PKR {expenses.length > 0 ? Math.round(totalAmount / expenses.length).toLocaleString() : '0'}
          </div>
          <p className="text-[11px] text-slate-500">Per logged voucher</p>
        </div>

      </div>

      {/* Main Content Layout: Breakdown Sidebar + Table */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        
        {/* Category Breakdown Progress Card */}
        <div className="bg-white p-5 rounded-2xl border border-slate-200 shadow-sm space-y-4">
          <div className="flex items-center justify-between pb-3 border-b border-slate-100">
            <h3 className="text-sm font-bold text-slate-900 uppercase tracking-wide flex items-center gap-2">
              <PieChart className="w-4 h-4 text-indigo-600" />
              Category Breakdown
            </h3>
            <span className="text-[11px] font-bold text-indigo-600 bg-indigo-50 px-2 py-0.5 rounded-full">
              {Object.keys(categoryTotals).length} Active
            </span>
          </div>

          <div className="space-y-3 max-h-[380px] overflow-y-auto pr-1">
            {Object.entries(categoryTotals).map(([catName, catAmt]) => {
              const numAmt = Number(catAmt);
              const pct = totalAmount > 0 ? Math.round((numAmt / totalAmount) * 100) : 0;
              return (
                <div key={catName} className="space-y-1">
                  <div className="flex items-center justify-between text-xs">
                    <span className="font-semibold text-slate-700">{catName}</span>
                    <span className="font-bold text-slate-900">
                      PKR {numAmt.toLocaleString()} ({pct}%)
                    </span>
                  </div>
                  <div className="w-full bg-slate-100 h-2 rounded-full overflow-hidden">
                    <div 
                      className="bg-indigo-600 h-full rounded-full transition-all duration-500" 
                      style={{ width: `${pct}%` }} 
                    />
                  </div>
                </div>
              );
            })}
            {Object.keys(categoryTotals).length === 0 && (
              <p className="text-xs text-slate-400 italic text-center py-6">No expenses logged yet.</p>
            )}
          </div>
        </div>

        {/* Expenses List & Controls (Span 2) */}
        <div className="lg:col-span-2 bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden flex flex-col">
          
          {/* Controls Bar */}
          <div className="p-4 border-b border-slate-100 bg-slate-50 flex flex-col sm:flex-row items-center justify-between gap-3">
            <div className="relative w-full sm:w-72">
              <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
              <input 
                type="text"
                placeholder="Search description, category, officer..."
                value={searchTerm}
                onChange={e => setSearchTerm(e.target.value)}
                className="w-full pl-9 pr-4 py-2 bg-white border border-slate-200 rounded-xl text-xs text-slate-800 focus:outline-none focus:ring-2 focus:ring-indigo-500"
              />
            </div>

            <div className="flex items-center gap-2 w-full sm:w-auto">
              <Filter className="w-4 h-4 text-slate-400" />
              <select
                value={selectedCategory}
                onChange={e => setSelectedCategory(e.target.value)}
                className="px-3 py-2 bg-white border border-slate-200 rounded-xl text-xs font-semibold text-slate-700 focus:outline-none focus:ring-2 focus:ring-indigo-500"
              >
                <option value="ALL">All Categories</option>
                {categoriesList.map(c => (
                  <option key={c} value={c}>{c}</option>
                ))}
              </select>
            </div>
          </div>

          {/* Table View */}
          <div className="overflow-x-auto flex-1">
            <table className="w-full text-left text-xs border-collapse">
              <thead>
                <tr className="bg-slate-100/70 border-b border-slate-200 text-slate-600 uppercase text-[10px] font-extrabold tracking-wider">
                  <th className="p-3">Date</th>
                  <th className="p-3">Category</th>
                  <th className="p-3">Description</th>
                  <th className="p-3 text-right">Amount (PKR)</th>
                  <th className="p-3">Payment Mode</th>
                  <th className="p-3 text-center">Receipt</th>
                  <th className="p-3 text-center">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {filteredExpenses.map(item => (
                  <tr key={item.id} className="hover:bg-slate-50/80 transition">
                    <td className="p-3 font-semibold text-slate-800 whitespace-nowrap">
                      {item.date}
                    </td>
                    <td className="p-3">
                      <span className="px-2 py-0.5 rounded-full text-[10px] font-extrabold bg-indigo-50 text-indigo-700 border border-indigo-200">
                        {item.category}
                      </span>
                    </td>
                    <td className="p-3 text-slate-700 max-w-xs truncate" title={item.description}>
                      {item.description}
                      <span className="block text-[10px] text-slate-400">By: {item.logged_by}</span>
                    </td>
                    <td className="p-3 text-right font-black text-rose-700 whitespace-nowrap">
                      PKR {item.amount.toLocaleString()}
                    </td>
                    <td className="p-3 text-slate-600 font-medium whitespace-nowrap">
                      {item.payment_mode}
                    </td>
                    <td className="p-3 text-center whitespace-nowrap">
                      {item.receipt_url ? (
                        <button
                          type="button"
                          onClick={() => setPreviewModal({ title: `Receipt Voucher — ${item.category} (${item.date})`, url: item.receipt_url! })}
                          className="px-2.5 py-1 bg-amber-500 hover:bg-amber-600 text-slate-900 rounded-lg font-bold text-[11px] shadow inline-flex items-center gap-1"
                          title="Preview Scanned Receipt Document"
                        >
                          <Eye className="w-3 h-3" />
                          <span>Receipt</span>
                        </button>
                      ) : (
                        <span className="text-[10px] text-slate-400 italic">No Scan</span>
                      )}
                    </td>
                    <td className="p-3 text-center whitespace-nowrap space-x-1">
                      <button
                        onClick={() => handleOpenEdit(item)}
                        className="p-1.5 text-blue-600 hover:bg-blue-50 rounded-lg transition"
                        title="Edit Expense"
                      >
                        <Edit3 className="w-3.5 h-3.5" />
                      </button>
                      <button
                        onClick={() => onDeleteExpense(item.id)}
                        className="p-1.5 text-rose-600 hover:bg-rose-50 rounded-lg transition"
                        title="Delete Entry"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </td>
                  </tr>
                ))}
                {filteredExpenses.length === 0 && (
                  <tr>
                    <td colSpan={6} className="p-8 text-center text-slate-400 italic">
                      No expense records found matching filter criteria.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>

        </div>

      </div>

      {/* Add / Edit Expense Modal */}
      {isModalOpen && (
        <div className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl max-w-lg w-full p-6 shadow-2xl border border-slate-200 space-y-4 relative">
            <button
              onClick={() => setIsModalOpen(false)}
              className="absolute top-4 right-4 text-slate-400 hover:text-slate-600 p-1 rounded-lg"
            >
              <X className="w-5 h-5" />
            </button>

            <div className="flex items-center gap-3 border-b border-slate-100 pb-3">
              <div className="p-2.5 bg-indigo-50 text-indigo-600 rounded-xl">
                <Receipt className="w-5 h-5" />
              </div>
              <div>
                <h3 className="text-base font-bold text-slate-900">
                  {editingExpense ? 'Edit Expense Entry' : 'Log New Operational Expense'}
                </h3>
                <p className="text-xs text-slate-500">Record campus expenditure with audit details</p>
              </div>
            </div>

            {statusMsg && (
              <div className={`p-3 rounded-xl text-xs font-semibold flex items-center gap-2 ${
                statusMsg.type === 'success' ? 'bg-emerald-50 text-emerald-800 border border-emerald-200' : 'bg-rose-50 text-rose-800 border border-rose-200'
              }`}>
                {statusMsg.type === 'success' ? <CheckCircle2 className="w-4 h-4" /> : <AlertCircle className="w-4 h-4" />}
                {statusMsg.text}
              </div>
            )}

            <form onSubmit={handleSubmit} className="space-y-4 text-xs">
              
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block font-bold text-slate-700 mb-1">Expense Date</label>
                  <input
                    type="date"
                    value={date}
                    onChange={e => setDate(e.target.value)}
                    required
                    className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-slate-800 focus:ring-2 focus:ring-indigo-500 font-medium"
                  />
                </div>

                <div>
                  <div className="flex items-center justify-between mb-1">
                    <label className="block font-bold text-slate-700">Category</label>
                    <button
                      type="button"
                      onClick={() => setIsAddingNewCategory(!isAddingNewCategory)}
                      className="text-[10px] font-bold text-indigo-600 hover:text-indigo-800 underline"
                    >
                      {isAddingNewCategory ? 'Cancel' : '+ Custom Cat'}
                    </button>
                  </div>
                  {isAddingNewCategory ? (
                    <div className="flex gap-1">
                      <input
                        type="text"
                        placeholder="e.g. Science Lab Supplies"
                        value={newCategoryInput}
                        onChange={e => setNewCategoryInput(e.target.value)}
                        className="w-full px-2 py-1.5 bg-slate-50 border border-indigo-300 rounded-lg text-slate-800"
                      />
                      <button
                        type="button"
                        onClick={handleAddCustomCategory}
                        className="px-2 py-1.5 bg-indigo-600 text-white rounded-lg font-bold text-[10px]"
                      >
                        Add
                      </button>
                    </div>
                  ) : (
                    <select
                      value={category}
                      onChange={e => setCategory(e.target.value)}
                      className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-slate-800 focus:ring-2 focus:ring-indigo-500 font-semibold"
                    >
                      {categoriesList.map(c => (
                        <option key={c} value={c}>{c}</option>
                      ))}
                    </select>
                  )}
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block font-bold text-slate-700 mb-1">Amount (PKR)</label>
                  <input
                    type="number"
                    placeholder="e.g. 25000"
                    value={amount}
                    onChange={e => setAmount(e.target.value)}
                    required
                    min="1"
                    className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-slate-800 font-bold focus:ring-2 focus:ring-indigo-500"
                  />
                </div>

                <div>
                  <div className="flex items-center justify-between mb-1">
                    <label className="block font-bold text-slate-700">Payment Mode</label>
                    <button
                      type="button"
                      onClick={() => setIsAddingNewPaymentMode(!isAddingNewPaymentMode)}
                      className="text-[10px] font-bold text-indigo-600 hover:text-indigo-800 underline"
                    >
                      {isAddingNewPaymentMode ? 'Cancel' : '+ Custom Mode'}
                    </button>
                  </div>
                  {isAddingNewPaymentMode ? (
                    <div className="flex gap-1">
                      <input
                        type="text"
                        placeholder="e.g. JazzCash / EasyPaisa"
                        value={newPaymentModeInput}
                        onChange={e => setNewPaymentModeInput(e.target.value)}
                        className="w-full px-2 py-1.5 bg-slate-50 border border-indigo-300 rounded-lg text-slate-800"
                      />
                      <button
                        type="button"
                        onClick={handleAddCustomPaymentMode}
                        className="px-2 py-1.5 bg-indigo-600 text-white rounded-lg font-bold text-[10px]"
                      >
                        Add
                      </button>
                    </div>
                  ) : (
                    <select
                      value={paymentMode}
                      onChange={e => setPaymentMode(e.target.value)}
                      className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-slate-800 focus:ring-2 focus:ring-indigo-500 font-medium"
                    >
                      {paymentModesList.map(pm => (
                        <option key={pm} value={pm}>{pm}</option>
                      ))}
                    </select>
                  )}
                </div>
              </div>

              <div>
                <label className="block font-bold text-slate-700 mb-1">Description / Voucher Details</label>
                <textarea
                  rows={2}
                  placeholder="Provide reason, vendor details or receipt notes..."
                  value={description}
                  onChange={e => setDescription(e.target.value)}
                  required
                  className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-slate-800 focus:ring-2 focus:ring-indigo-500"
                />
              </div>

              <div>
                <label className="block font-bold text-slate-700 mb-1">Logged By (Officer)</label>
                <input
                  type="text"
                  value={loggedBy}
                  onChange={e => setLoggedBy(e.target.value)}
                  required
                  className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-slate-800 focus:ring-2 focus:ring-indigo-500"
                />
              </div>

              <div>
                <label className="block font-bold text-slate-700 mb-1">Attach Scanned Receipt Document / Image</label>
                <div className="flex items-center gap-2 flex-wrap bg-slate-50 p-2.5 rounded-xl border border-slate-200">
                  <label className="px-3 py-1.5 bg-white hover:bg-slate-100 text-slate-800 border border-slate-300 rounded-lg font-bold cursor-pointer flex items-center gap-1.5 text-xs shadow-sm">
                    <Upload className="w-3.5 h-3.5 text-indigo-600" />
                    <span>{receiptUrl ? 'Replace Receipt File' : 'Upload Receipt File'}</span>
                    <input
                      type="file"
                      accept=".pdf,image/*"
                      onChange={(e) => {
                        const f = e.target.files?.[0];
                        if (f) {
                          const r = new FileReader();
                          r.onload = (ev) => setReceiptUrl(ev.target?.result as string);
                          r.readAsDataURL(f);
                        }
                      }}
                      className="hidden"
                    />
                  </label>
                  {receiptUrl && (
                    <>
                      <button
                        type="button"
                        onClick={() => setPreviewModal({ title: `Receipt Voucher — ${category}`, url: receiptUrl })}
                        className="px-3 py-1.5 bg-amber-500 hover:bg-amber-600 text-slate-900 rounded-lg font-bold flex items-center gap-1 text-xs shadow"
                      >
                        <Eye className="w-3.5 h-3.5" /> Preview Receipt
                      </button>
                      <button
                        type="button"
                        onClick={() => setReceiptUrl('')}
                        className="px-2 py-1.5 bg-red-100 hover:bg-red-200 text-red-700 rounded-lg font-bold text-xs"
                        title="Remove Receipt"
                      >
                        <X className="w-3.5 h-3.5" />
                      </button>
                    </>
                  )}
                </div>
              </div>

              <DynamicFieldSection
                target="financial"
                customFields={customFields}
                onAddCustomField={onAddCustomField}
                onUpdateCustomField={onUpdateCustomField}
                onDeleteCustomField={onDeleteCustomField}
                onReorderCustomFields={onReorderCustomFields}
                values={expenseCustomFields}
                onValuesChange={setExpenseCustomFields}
                sectionTitle="Custom Expense Fields"
                onNotify={msg => setStatusMsg({ type: 'success', text: msg })}
              />

              <div className="flex items-center justify-between pt-3 border-t border-slate-100">
                <button
                  type="button"
                  onClick={handleReceiptScanClick}
                  disabled={isScanning}
                  className="flex items-center gap-1.5 px-3 py-1.5 bg-purple-50 hover:bg-purple-100 text-purple-700 border border-purple-200 rounded-xl text-[11px] font-bold transition"
                >
                  <Scan className="w-3.5 h-3.5 text-purple-600" />
                  Auto-fill from Receipt
                </button>

                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={() => setIsModalOpen(false)}
                    className="px-4 py-2 bg-slate-100 text-slate-700 font-semibold rounded-xl hover:bg-slate-200 transition"
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    className="px-5 py-2 bg-indigo-600 hover:bg-indigo-500 text-white font-bold rounded-xl shadow-lg shadow-indigo-600/30 transition"
                  >
                    {editingExpense ? 'Save Changes' : 'Record Expense'}
                  </button>
                </div>
              </div>

            </form>
          </div>
        </div>
      )}

      {/* DOCUMENT PREVIEW MODAL FOR EXPENSE RECEIPTS */}
      <DocumentPreviewModal
        isOpen={!!previewModal}
        onClose={() => setPreviewModal(null)}
        title={previewModal?.title || 'Expense Receipt Document Preview'}
        url={previewModal?.url}
      />

    </div>
  );
};
