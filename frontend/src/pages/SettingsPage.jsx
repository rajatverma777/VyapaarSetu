import { useState, useEffect } from 'react'
import { Settings, Building2, Users, Database, Key, Plus, Trash2, Sun, Moon, Palette, User } from 'lucide-react'
import toast from 'react-hot-toast'
import { settingsAPI, backupAPI, userAPI } from '../services/api'
import { FormSkeleton, Modal, FormField } from '../components/ui'
import { useAuth } from '../context/AuthContext'
import { useTheme } from '../context/ThemeContext'
import { format } from 'date-fns'

const TABS = ['profile', 'company', 'users', 'appearance', 'backup', 'password']

const compressImage = (file, maxWidth, maxHeight, callback) => {
  const reader = new FileReader()
  reader.onload = (e) => {
    const img = new Image()
    img.onload = () => {
      const canvas = document.createElement('canvas')
      let width = img.width
      let height = img.height

      if (width > height) {
        if (width > maxWidth) {
          height = Math.round((height * maxWidth) / width)
          width = maxWidth
        }
      } else {
        if (height > maxHeight) {
          width = Math.round((width * maxHeight) / height)
          height = maxHeight
        }
      }

      canvas.width = width
      canvas.height = height
      const ctx = canvas.getContext('2d')
      ctx.drawImage(img, 0, 0, width, height)
      
      const compressedBase64 = canvas.toDataURL('image/png')
      callback(compressedBase64)
    }
    img.src = e.target.result
  }
  reader.readAsDataURL(file)
}

export default function SettingsPage() {
  const { user, isAdmin, updateUser } = useAuth()
  const { dark, toggle } = useTheme()
  const [tab, setTab]     = useState('profile')
  const [loading, setLoading]  = useState(false)
  const [saving, setSaving]    = useState(false)

  // Company
  const [company, setCompany] = useState({
    company_name: '', gstin: '', address: '', city: '', state: '',
    state_code: '', pincode: '', mobile: '', email: '', website: '',
    bank_name: '', bank_account: '', bank_ifsc: '',
    invoice_prefix: 'INV', invoice_terms: '', invoice_footer: '',
    logo_base64: '', watermark_base64: ''
  })

  // Profile
  const [profileForm, setProfileForm] = useState({
    full_name: '', email: '', mobile: ''
  })
  const [profileSaving, setProfileSaving] = useState(false)

  // Users
  const [users, setUsers]     = useState([])
  const [showUserForm, setShowUserForm] = useState(false)
  const [userForm, setUserForm] = useState({ username: '', password: '', full_name: '', email: '', role: 'staff', mobile: '' })
  const [userSaving, setUserSaving] = useState(false)
  const [showPermissionsModal, setShowPermissionsModal] = useState(false)
  const [selectedUser, setSelectedUser] = useState(null)
  const [permissionsForm, setPermissionsForm] = useState({
    can_view_products: true,
    can_manage_products: false,
    can_create_sales: true,
    can_view_sales: true,
    can_create_purchases: false,
    can_view_purchases: false,
    can_manage_settings: false
  })

  // Backup
  const [backups, setBackups] = useState([])
  const [backupLoading, setBackupLoading] = useState(false)

  // Password
  const [pwForm, setPwForm]   = useState({ old_password: '', new_password: '', confirm: '' })
  const [pwSaving, setPwSaving] = useState(false)

  useEffect(() => { loadCompany() }, [])
  useEffect(() => { if (tab === 'users') loadUsers(); if (tab === 'backup') loadBackups() }, [tab])
  useEffect(() => {
    if (user) {
      setProfileForm({
        full_name: user.full_name || '',
        email: user.email || '',
        mobile: user.mobile || ''
      })
    }
  }, [user])

  const loadCompany = async () => {
    setLoading(true)
    try {
      const { data } = await settingsAPI.getCompany()
      if (data) setCompany(c => ({ ...c, ...data }))
    } catch { /**/ }
    finally { setLoading(false) }
  }

  const loadUsers = async () => {
    try { const { data } = await userAPI.list(); setUsers(data) }
    catch { /**/ }
  }

  const loadBackups = async () => {
    try { const { data } = await backupAPI.list(); setBackups(data) }
    catch { /**/ }
  }

  const saveCompany = async () => {
    setSaving(true)
    try {
      await settingsAPI.updateCompany(company)
      toast.success('Company settings saved')
    } catch (e) { toast.error(e.response?.data?.detail || 'Failed') }
    finally { setSaving(false) }
  }

  const saveProfile = async () => {
    if (!profileForm.full_name) return toast.error('Full Name is required')
    setProfileSaving(true)
    try {
      await userAPI.updateProfile(profileForm)
      toast.success('Profile updated successfully!')
      updateUser({ ...user, ...profileForm })
    } catch (e) {
      toast.error(e.response?.data?.detail || 'Failed to update profile')
    } finally {
      setProfileSaving(false)
    }
  }

  const createUser = async () => {
    if (!userForm.username || !userForm.password || !userForm.full_name)
      return toast.error('Fill required fields')
    setUserSaving(true)
    try {
      await userAPI.create(userForm)
      toast.success('User created')
      setShowUserForm(false)
      setUserForm({ username: '', password: '', full_name: '', email: '', role: 'staff', mobile: '' })
      loadUsers()
    } catch (e) { toast.error(e.response?.data?.detail || 'Failed') }
    finally { setUserSaving(false) }
  }

  const deleteUser = async (id) => {
    if (!window.confirm('Are you sure you want to delete this user? This action cannot be undone.')) return
    try { await userAPI.delete(id); toast.success('User deleted'); loadUsers() }
    catch { toast.error('Failed') }
  }

  const toggleUserStatus = async (targetUser) => {
    try {
      await userAPI.update(targetUser.id, { is_active: !targetUser.is_active })
      toast.success(`User ${targetUser.is_active ? 'deactivated' : 'activated'}`)
      loadUsers()
    } catch (e) {
      toast.error(e.response?.data?.detail || 'Failed to update user status')
    }
  }

  const handleEditPermissions = (targetUser) => {
    setSelectedUser(targetUser)
    setPermissionsForm(targetUser.permissions || {
      can_view_products: true,
      can_manage_products: false,
      can_create_sales: true,
      can_view_sales: true,
      can_create_purchases: false,
      can_view_purchases: false,
      can_manage_settings: false
    })
    setShowPermissionsModal(true)
  }

  const savePermissions = async () => {
    try {
      await userAPI.update(selectedUser.id, { permissions: permissionsForm })
      toast.success('Permissions updated successfully!')
      setShowPermissionsModal(false)
      loadUsers()
    } catch (e) {
      toast.error(e.response?.data?.detail || 'Failed to save permissions')
    }
  }


  const createBackup = async () => {
    setBackupLoading(true)
    try {
      const { data } = await backupAPI.create()
      toast.success('Backup created!')
      loadBackups()
    } catch { toast.error('Backup failed') }
    finally { setBackupLoading(false) }
  }

  const changePassword = async () => {
    if (!pwForm.old_password || !pwForm.new_password) return toast.error('Fill all fields')
    if (pwForm.new_password !== pwForm.confirm) return toast.error('Passwords do not match')
    setPwSaving(true)
    try {
      await userAPI.changePassword({ old_password: pwForm.old_password, new_password: pwForm.new_password })
      toast.success('Password changed')
      setPwForm({ old_password: '', new_password: '', confirm: '' })
    } catch (e) { toast.error(e.response?.data?.detail || 'Failed') }
    finally { setPwSaving(false) }
  }

  const tabIcons = { profile: User, company: Building2, users: Users, appearance: Palette, backup: Database, password: Key }
  const setC = (k, v) => setCompany(c => ({ ...c, [k]: v }))
  const setU = (k, v) => setUserForm(f => ({ ...f, [k]: v }))

  const visibleTabs = TABS.filter(t => {
    if (t === 'company') return isAdmin || user?.permissions?.can_manage_settings
    if (t === 'backup') return isAdmin
    return true
  })

  return (
    <div className="space-y-5">
      <h1 className="page-title">Settings</h1>

      <div className="glass-tab-track">
        {visibleTabs.map(t => {
          const Icon = tabIcons[t]
          const isActive = tab === t
          return (
            <button
              key={t}
              onClick={() => {
                setTab(t)
              }}
              className={`glass-tab-btn capitalize ${isActive ? 'active' : ''}`}
            >
              {isActive && (
                <>
                  <div className="glass-tab-active-pill" />
                  <div className="glass-tab-active-shadow" />
                </>
              )}
              <Icon size={14} className="relative z-10" />
              <span className="relative z-10">{t}</span>
            </button>
          )
        })}
      </div>

      {/* Profile Tab */}
      {tab === 'profile' && (
        <div className="card p-6 max-w-md animate-fade-in">
          <h2 className="section-title mb-5">Personal Profile Details</h2>
          <div className="space-y-4">
            <FormField label="Full Name" required>
              <input 
                type="text" 
                className="input" 
                value={profileForm.full_name} 
                onChange={e => setProfileForm(f => ({ ...f, full_name: e.target.value }))} 
              />
            </FormField>
            <FormField label="Email Address">
              <input 
                type="email" 
                className="input" 
                value={profileForm.email} 
                onChange={e => setProfileForm(f => ({ ...f, email: e.target.value }))} 
              />
            </FormField>
            <FormField label="Mobile Number">
              <input 
                type="text" 
                className="input" 
                value={profileForm.mobile} 
                onChange={e => setProfileForm(f => ({ ...f, mobile: e.target.value }))} 
              />
            </FormField>
            <button onClick={saveProfile} disabled={profileSaving} className="btn-primary w-full justify-center">
              {profileSaving ? 'Saving…' : 'Save Profile'}
            </button>
          </div>
        </div>
      )}

      {/* Company Tab */}
      {tab === 'company' && (isAdmin || user?.permissions?.can_manage_settings) && (
        loading ? <FormSkeleton /> : (
          <div className="card p-6">
            <h2 className="section-title mb-5">Company Information</h2>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div className="sm:col-span-2">
                <FormField label="Company Name" required>
                  <input className="input" value={company.company_name} onChange={e => setC('company_name', e.target.value)} />
                </FormField>
              </div>
              <FormField label="GSTIN">
                <input className="input font-mono" value={company.gstin} onChange={e => setC('gstin', e.target.value.toUpperCase())} placeholder="22AAAAA0000A1Z5" />
              </FormField>
              <FormField label="State Code">
                <input className="input" value={company.state_code} onChange={e => setC('state_code', e.target.value)} placeholder="09" />
              </FormField>
              <FormField label="Mobile">
                <input className="input" value={company.mobile} onChange={e => setC('mobile', e.target.value)} />
              </FormField>
              <FormField label="Email">
                <input type="email" className="input" value={company.email} onChange={e => setC('email', e.target.value)} />
              </FormField>
              <FormField label="Website">
                <input className="input" value={company.website} onChange={e => setC('website', e.target.value)} />
              </FormField>
              <FormField label="Invoice Prefix">
                <input className="input" value={company.invoice_prefix} onChange={e => setC('invoice_prefix', e.target.value)} />
              </FormField>
              <div className="sm:col-span-2">
                <FormField label="Address">
                  <textarea className="input" rows={2} value={company.address} onChange={e => setC('address', e.target.value)} />
                </FormField>
              </div>
              <FormField label="City"><input className="input" value={company.city} onChange={e => setC('city', e.target.value)} /></FormField>
              <FormField label="State"><input className="input" value={company.state} onChange={e => setC('state', e.target.value)} /></FormField>

              <div className="sm:col-span-2 border-t dark:border-gray-700 pt-4 mt-2">
                <h3 className="text-sm font-semibold text-gray-700 dark:text-gray-300 mb-3">Bank Details (for Invoice)</h3>
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                  <FormField label="Bank Name"><input className="input" value={company.bank_name} onChange={e => setC('bank_name', e.target.value)} /></FormField>
                  <FormField label="Account No."><input className="input font-mono" value={company.bank_account} onChange={e => setC('bank_account', e.target.value)} /></FormField>
                  <FormField label="IFSC Code"><input className="input font-mono" value={company.bank_ifsc} onChange={e => setC('bank_ifsc', e.target.value.toUpperCase())} /></FormField>
                </div>
              </div>
              <div className="sm:col-span-2">
                <FormField label="Invoice Terms">
                  <textarea className="input" rows={2} value={company.invoice_terms} onChange={e => setC('invoice_terms', e.target.value)} placeholder="e.g. Goods once sold will not be taken back." />
                </FormField>
              </div>
              <div className="sm:col-span-2">
                <FormField label="Invoice Footer">
                  <input className="input" value={company.invoice_footer} onChange={e => setC('invoice_footer', e.target.value)} placeholder="e.g. Thank you for your business!" />
                </FormField>
              </div>

              <div className="sm:col-span-2 border-t dark:border-gray-700 pt-4 mt-2">
                <h3 className="text-sm font-semibold text-gray-700 dark:text-gray-300 mb-3">Invoice Branding</h3>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-6">
                  {/* Logo Upload */}
                  <div className="flex flex-col items-center justify-center p-4 border border-dashed border-gray-300 dark:border-gray-700 rounded-2xl bg-gray-50/50 dark:bg-gray-800/20">
                    <label className="text-xs font-semibold text-gray-500 mb-2">Company Logo (Header)</label>
                    {company.logo_base64 ? (
                      <div className="relative group w-24 h-24 mb-3 rounded-xl overflow-hidden border border-gray-200 dark:border-gray-700 bg-white flex items-center justify-center">
                        <img src={company.logo_base64} alt="Company Logo" className="max-w-full max-h-full object-contain" />
                        <button
                          onClick={() => setC('logo_base64', '')}
                          className="absolute inset-0 bg-black/60 opacity-0 group-hover:opacity-100 flex items-center justify-center text-white transition-opacity duration-200"
                        >
                          <Trash2 size={16} />
                        </button>
                      </div>
                    ) : (
                      <div className="w-24 h-24 mb-3 border border-gray-200 dark:border-gray-700 rounded-xl bg-white dark:bg-gray-800 flex items-center justify-center text-gray-400">
                        <Building2 size={32} />
                      </div>
                    )}
                    <label className="btn-secondary text-xs cursor-pointer">
                      Upload Logo
                      <input
                        type="file"
                        accept="image/*"
                        className="hidden"
                        onChange={(e) => {
                          const file = e.target.files[0]
                          if (file) {
                            compressImage(file, 400, 400, (base64) => {
                              setC('logo_base64', base64)
                            })
                          }
                        }}
                      />
                    </label>
                  </div>

                  {/* Watermark Upload */}
                  <div className="flex flex-col items-center justify-center p-4 border border-dashed border-gray-300 dark:border-gray-700 rounded-2xl bg-gray-50/50 dark:bg-gray-800/20">
                    <label className="text-xs font-semibold text-gray-500 mb-2">Invoice Watermark (Background)</label>
                    {company.watermark_base64 ? (
                      <div className="relative group w-24 h-24 mb-3 rounded-xl overflow-hidden border border-gray-200 dark:border-gray-700 bg-white flex items-center justify-center">
                        <img src={company.watermark_base64} alt="Invoice Watermark" className="max-w-full max-h-full object-contain opacity-50" />
                        <button
                          onClick={() => setC('watermark_base64', '')}
                          className="absolute inset-0 bg-black/60 opacity-0 group-hover:opacity-100 flex items-center justify-center text-white transition-opacity duration-200"
                        >
                          <Trash2 size={16} />
                        </button>
                      </div>
                    ) : (
                      <div className="w-24 h-24 mb-3 border border-gray-200 dark:border-gray-700 rounded-xl bg-white dark:bg-gray-800 flex items-center justify-center text-gray-400">
                        <Palette size={32} />
                      </div>
                    )}
                    <label className="btn-secondary text-xs cursor-pointer">
                      Upload Watermark
                      <input
                        type="file"
                        accept="image/*"
                        className="hidden"
                        onChange={(e) => {
                          const file = e.target.files[0]
                          if (file) {
                            compressImage(file, 800, 800, (base64) => {
                              setC('watermark_base64', base64)
                            })
                          }
                        }}
                      />
                    </label>
                  </div>
                </div>
              </div>
            </div>
            <div className="flex justify-end mt-5">
              <button onClick={saveCompany} disabled={saving} className="btn-primary">
                {saving ? 'Saving…' : 'Save Settings'}
              </button>
            </div>
          </div>
        )
      )}

      {/* Users Tab */}
      {tab === 'users' && (
        <div className="space-y-4">
          {/* Prominent Company Code Box */}
          {isAdmin && (
            <div className="card p-4 bg-indigo-50/50 dark:bg-indigo-950/20 border border-indigo-100 dark:border-indigo-900/30 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
              <div>
                <h4 className="text-xs font-bold uppercase tracking-wider text-indigo-650 dark:text-indigo-400">Your Company Code</h4>
                <p className="text-xs text-gray-500 dark:text-gray-400 mt-0.5">Share this code with your staff members so they can join your business during registration.</p>
              </div>
              <div className="flex items-center gap-2">
                <span className="font-mono text-lg font-black bg-white dark:bg-gray-800 px-4 py-2 border border-gray-200 dark:border-gray-700 rounded-xl tracking-wider select-all text-indigo-650 dark:text-indigo-300">
                  {user?.tenant_id || '—'}
                </span>
                <button
                  onClick={() => {
                    navigator.clipboard.writeText(user?.tenant_id || '')
                    toast.success('Company Code copied!')
                  }}
                  className="btn-secondary text-xs py-2"
                >
                  Copy
                </button>
              </div>
            </div>
          )}

          {isAdmin && (
            <div className="flex justify-end">
              <button onClick={() => setShowUserForm(true)} className="btn-primary"><Plus size={15}/> Add User</button>
            </div>
          )}
          <div className="card">
            <div className="table-container">
              <table className="table">
                <thead>
                  <tr>
                    <th>Name</th>
                    <th>Username</th>
                    <th>Role</th>
                    <th>Mobile</th>
                    <th>Status</th>
                    {isAdmin && <th>Actions</th>}
                  </tr>
                </thead>
                <tbody>
                  {users.map(u => (
                    <tr key={u.id}>
                      <td className="font-medium">{u.full_name}</td>
                      <td className="font-mono text-sm">{u.username}</td>
                      <td className="capitalize"><span className="badge-blue">{u.role}</span></td>
                      <td className="text-sm text-gray-500">{u.mobile || '—'}</td>
                      <td>
                        <div className="flex items-center gap-2.5">
                          <span className={u.is_active ? 'badge-green' : 'badge-red'}>
                            {u.is_active ? 'Active' : 'Inactive'}
                          </span>
                          {isAdmin && u.id !== user?.id && (
                            <button
                              onClick={() => toggleUserStatus(u)}
                              className={`relative inline-flex h-5 w-9 items-center rounded-full transition-colors duration-200 focus:outline-none ${u.is_active ? 'bg-indigo-650' : 'bg-gray-250 dark:bg-gray-700'}`}
                              title="Toggle Status"
                            >
                              <span
                                className="inline-block h-3.5 w-3.5 transform rounded-full bg-white transition-transform duration-200"
                                style={{ transform: u.is_active ? 'translateX(18px)' : 'translateX(2px)' }}
                              />
                            </button>
                          )}
                        </div>
                      </td>
                      {isAdmin && (
                        <td>
                          <div className="flex items-center gap-1">
                            {u.role === 'staff' && (
                              <button
                                onClick={() => handleEditPermissions(u)}
                                className="btn-icon text-indigo-650 dark:text-indigo-400 hover:bg-indigo-50 dark:hover:bg-indigo-950/30"
                                title="Edit Permissions"
                              >
                                <Key size={14} />
                              </button>
                            )}
                            {u.id !== user?.id && (
                              <button
                                onClick={() => deleteUser(u.id)}
                                className="btn-icon text-red-500 hover:bg-red-50 dark:hover:bg-red-950/20"
                                title="Delete User"
                              >
                                <Trash2 size={14} />
                              </button>
                            )}
                          </div>
                        </td>
                      )}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {/* Backup Tab */}
      {tab === 'backup' && isAdmin && (
        <div className="space-y-4">
          <div className="card p-5">
            <h2 className="section-title mb-3">Database Backup</h2>
            <p className="text-sm text-gray-500 mb-4">Create a full backup of all your data including products, customers, sales, and more.</p>
            <button onClick={createBackup} disabled={backupLoading} className="btn-primary">
              <Database size={15} />{backupLoading ? 'Creating backup…' : 'Create Backup Now'}
            </button>
          </div>
          <div className="card">
            <div className="card-header"><h2 className="section-title">Available Backups</h2></div>
            <div className="divide-y divide-gray-100 dark:divide-gray-700">
              {backups.length === 0 ? (
                <div className="p-8 text-center text-gray-400">No backups yet</div>
              ) : backups.map(b => (
                <div key={b.filename} className="px-5 py-3 flex items-center justify-between">
                  <div>
                    <p className="text-sm font-medium">{b.filename}</p>
                    <p className="text-xs text-gray-500">{format(new Date(b.created), 'dd/MM/yyyy HH:mm')} · {(b.size / 1024).toFixed(1)} KB</p>
                  </div>
                  <a href={b.url} download className="btn-secondary text-xs">Download</a>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* Password Tab */}
      {tab === 'password' && (
        <div className="card p-6 max-w-md">
          <h2 className="section-title mb-5">Change Password</h2>
          <div className="space-y-4">
            <FormField label="Current Password" required>
              <input type="password" className="input" value={pwForm.old_password} onChange={e => setPwForm(f => ({ ...f, old_password: e.target.value }))} />
            </FormField>
            <FormField label="New Password" required>
              <input type="password" className="input" value={pwForm.new_password} onChange={e => setPwForm(f => ({ ...f, new_password: e.target.value }))} />
            </FormField>
            <FormField label="Confirm New Password" required>
              <input type="password" className="input" value={pwForm.confirm} onChange={e => setPwForm(f => ({ ...f, confirm: e.target.value }))} />
            </FormField>
            <button onClick={changePassword} disabled={pwSaving} className="btn-primary w-full justify-center">
              {pwSaving ? 'Updating…' : 'Update Password'}
            </button>
          </div>
        </div>
      )}

      {/* Appearance Tab */}
      {tab === 'appearance' && (
        <div className="card p-6">
          <h2 className="section-title mb-3">Appearance Settings</h2>
          <p className="text-sm text-gray-500 mb-6">Customize the interface theme of your Vyapaar Setu system.</p>
          
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-6 max-w-2xl">
            {/* Light Mode Option */}
            <div 
              onClick={() => { if (dark) toggle() }}
              className={`cursor-pointer rounded-2xl border-2 p-4 flex flex-col items-center gap-4 transition-all duration-200 hover:scale-[1.02] ${
                !dark 
                  ? 'border-indigo-600 bg-white/80 dark:bg-white/10 shadow-lg' 
                  : 'border-transparent bg-white/20 dark:bg-white/5 opacity-70 hover:opacity-100'
              }`}
            >
              <div className="w-full aspect-video rounded-xl bg-gray-50 border border-gray-250 flex items-center justify-center relative overflow-hidden shadow-sm">
                {/* Light Mode Mockup */}
                <div className="absolute top-2 left-2 right-2 h-3 bg-white border-b border-gray-250 rounded-sm flex items-center px-1 gap-1">
                  <div className="w-1.5 h-1.5 rounded-full bg-red-400" />
                  <div className="w-1.5 h-1.5 rounded-full bg-yellow-400" />
                  <div className="w-1.5 h-1.5 rounded-full bg-green-400" />
                </div>
                <div className="flex flex-col items-center gap-1.5 mt-2">
                  <Sun className="text-amber-500" size={24} />
                  <span className="text-[10px] font-bold text-gray-700">Light Mode</span>
                </div>
              </div>
              <div className="flex items-center gap-2">
                <input 
                  type="radio" 
                  checked={!dark} 
                  onChange={() => { if (dark) toggle() }}
                  className="text-indigo-650 focus:ring-indigo-500 cursor-pointer" 
                />
                <span className="text-sm font-semibold text-gray-950 dark:text-white">Light Theme</span>
              </div>
            </div>

            {/* Dark Mode Option */}
            <div 
              onClick={() => { if (!dark) toggle() }}
              className={`cursor-pointer rounded-2xl border-2 p-4 flex flex-col items-center gap-4 transition-all duration-200 hover:scale-[1.02] ${
                dark 
                  ? 'border-indigo-550 bg-white/80 dark:bg-white/10 shadow-lg' 
                  : 'border-transparent bg-white/20 dark:bg-white/5 opacity-70 hover:opacity-100'
              }`}
            >
              <div className="w-full aspect-video rounded-xl bg-[#0b101d] border border-gray-800 flex items-center justify-center relative overflow-hidden shadow-sm">
                {/* Dark Mode Mockup */}
                <div className="absolute top-2 left-2 right-2 h-3 bg-[#0d1527] border-b border-white/5 rounded-sm flex items-center px-1 gap-1">
                  <div className="w-1.5 h-1.5 rounded-full bg-red-500/50" />
                  <div className="w-1.5 h-1.5 rounded-full bg-yellow-500/50" />
                  <div className="w-1.5 h-1.5 rounded-full bg-green-500/50" />
                </div>
                <div className="flex flex-col items-center gap-1.5 mt-2">
                  <Moon className="text-indigo-400" size={24} />
                  <span className="text-[10px] font-bold text-gray-300">Dark Mode</span>
                </div>
              </div>
              <div className="flex items-center gap-2">
                <input 
                  type="radio" 
                  checked={dark} 
                  onChange={() => { if (!dark) toggle() }}
                  className="text-indigo-650 focus:ring-indigo-500 cursor-pointer" 
                />
                <span className="text-sm font-semibold text-gray-950 dark:text-white">Dark Theme</span>
              </div>
            </div>
          </div>
        </div>
      )}

      <Modal open={showUserForm} onClose={() => setShowUserForm(false)} title="Add User" size="md"
        footer={<>
          <button onClick={() => setShowUserForm(false)} className="btn-secondary">Cancel</button>
          <button onClick={createUser} disabled={userSaving} className="btn-primary">{userSaving ? 'Creating…' : 'Create'}</button>
        </>}
      >
        <div className="space-y-4">
          <FormField label="Full Name" required><input className="input" value={userForm.full_name} onChange={e => setU('full_name', e.target.value)} /></FormField>
          <div className="grid grid-cols-2 gap-3">
            <FormField label="Username" required><input className="input" value={userForm.username} onChange={e => setU('username', e.target.value)} /></FormField>
            <FormField label="Password" required><input type="password" className="input" value={userForm.password} onChange={e => setU('password', e.target.value)} /></FormField>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <FormField label="Role">
              <select className="select" value={userForm.role} onChange={e => setU('role', e.target.value)}>
                <option value="staff">Staff</option>
                <option value="admin">Admin</option>
              </select>
            </FormField>
            <FormField label="Mobile"><input className="input" value={userForm.mobile} onChange={e => setU('mobile', e.target.value)} /></FormField>
          </div>
          <FormField label="Email"><input type="email" className="input" value={userForm.email} onChange={e => setU('email', e.target.value)} /></FormField>
        </div>
      </Modal>
      <Modal open={showPermissionsModal} onClose={() => setShowPermissionsModal(false)} title={`Edit Permissions: ${selectedUser?.full_name}`} size="md"
        footer={<>
          <button onClick={() => setShowPermissionsModal(false)} className="btn-secondary">Cancel</button>
          <button onClick={savePermissions} className="btn-primary">Save Permissions</button>
        </>}
      >
        <div className="space-y-4 py-2">
          <p className="text-xs text-gray-500 dark:text-gray-400 mb-4">
            Configure granular access permissions for this staff member. Admin users automatically bypass all restrictions.
          </p>
          
          <div className="grid grid-cols-1 gap-2.5">
            {[
              { key: 'can_view_products', label: 'View Products & Inventory', desc: 'Allows viewing products list and current stock counts' },
              { key: 'can_manage_products', label: 'Manage Products', desc: 'Allows adding, editing, deleting, or importing product list' },
              { key: 'sales_and_billing', label: 'Sales & Billing', desc: 'Allows creating sales, viewing sales history, invoice details, printing, and reports' },
              { key: 'can_create_purchases', label: 'Create Purchases', desc: 'Allows entering new purchase records' },
              { key: 'can_view_purchases', label: 'View Purchases List', desc: 'Allows viewing purchase records history and reports' },
              { key: 'can_manage_settings', label: 'Manage Settings', desc: 'Allows editing company details, invoice terms, and units' }
            ].map(p => {
              const isSales = p.key === 'sales_and_billing'
              const checked = isSales 
                ? !!(permissionsForm.can_create_sales && permissionsForm.can_view_sales)
                : !!permissionsForm[p.key]

              const handleChange = (e) => {
                const val = e.target.checked
                if (isSales) {
                  setPermissionsForm(f => ({ ...f, can_create_sales: val, can_view_sales: val }))
                } else {
                  setPermissionsForm(f => ({ ...f, [p.key]: val }))
                }
              }

              return (
                <label key={p.key} className="flex items-start gap-3 p-3 rounded-xl border border-gray-150/40 dark:border-white/5 bg-gray-50/50 dark:bg-white/5 cursor-pointer hover:border-indigo-500/30 transition-all select-none">
                  <input
                    type="checkbox"
                    checked={checked}
                    onChange={handleChange}
                    className="mt-1 h-4.5 w-4.5 rounded text-indigo-650 border-gray-300 focus:ring-indigo-500 cursor-pointer"
                  />
                  <div>
                    <span className="text-sm font-semibold text-gray-950 dark:text-white block">{p.label}</span>
                    <span className="text-[11px] text-gray-500 dark:text-gray-400 mt-0.5 block">{p.desc}</span>
                  </div>
                </label>
              )
            })}
          </div>
        </div>
      </Modal>
    </div>
  )
}

