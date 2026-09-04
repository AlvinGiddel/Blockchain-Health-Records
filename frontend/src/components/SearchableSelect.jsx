import React, { useState, useRef, useEffect, useMemo } from 'react';
import { Search, ChevronDown, Check, X } from 'lucide-react';

/**
 * SearchableSelect Component
 * 
 * Replaces standard HTML <select> with a searchable combobox.
 * Features:
 * - Visible Search button and Dropdown Chevron arrow
 * - Instant real-time search filtering input inside dropdown
 * - Preserves native form validation and onChange events
 * - Accepts either `options` prop or standard `<option>` children
 */
export default function SearchableSelect({
  id,
  name,
  value,
  onChange,
  required = false,
  placeholder = '-- Select an option --',
  options = null,
  children = null,
  style = {},
  className = '',
  disabled = false
}) {
  const [isOpen, setIsOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const containerRef = useRef(null);
  const searchInputRef = useRef(null);

  // Extract options from either props or children
  const parsedOptions = useMemo(() => {
    if (options && Array.isArray(options)) {
      return options.map(opt => {
        if (typeof opt === 'object' && opt !== null) {
          return {
            value: opt.value !== undefined ? String(opt.value) : '',
            label: opt.label !== undefined ? String(opt.label) : String(opt.value || '')
          };
        }
        return { value: String(opt), label: String(opt) };
      });
    }

    if (children) {
      const items = [];
      React.Children.forEach(children, child => {
        if (React.isValidElement(child) && child.type === 'option') {
          const val = child.props.value !== undefined ? String(child.props.value) : String(child.props.children || '');
          const lbl = typeof child.props.children === 'string' 
            ? child.props.children 
            : (Array.isArray(child.props.children) ? child.props.children.join('') : String(child.props.children || ''));
          items.push({ value: val, label: lbl });
        }
      });
      return items;
    }

    return [];
  }, [options, children]);

  // Current selected option
  const selectedOption = useMemo(() => {
    const strVal = value !== undefined && value !== null ? String(value) : '';
    return parsedOptions.find(o => o.value === strVal) || null;
  }, [parsedOptions, value]);

  // Filtered options based on search query
  const filteredOptions = useMemo(() => {
    if (!searchQuery.trim()) return parsedOptions;
    const query = searchQuery.toLowerCase().trim();
    return parsedOptions.filter(opt => {
      // Always include empty placeholder option or match against label/value
      if (opt.value === '') return false;
      return opt.label.toLowerCase().includes(query) || opt.value.toLowerCase().includes(query);
    });
  }, [parsedOptions, searchQuery]);

  // Close dropdown on outside click
  useEffect(() => {
    function handleClickOutside(event) {
      if (containerRef.current && !containerRef.current.contains(event.target)) {
        setIsOpen(false);
        setSearchQuery('');
      }
    }
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  // Focus search input when dropdown opens
  useEffect(() => {
    if (isOpen && searchInputRef.current) {
      setTimeout(() => {
        searchInputRef.current?.focus();
      }, 50);
    }
  }, [isOpen]);

  const handleSelect = (val) => {
    if (disabled) return;
    if (onChange) {
      // Create standard synthetic event for transparent compatibility
      const event = {
        target: {
          id: id || name || '',
          name: name || id || '',
          value: val
        }
      };
      onChange(event);
    }
    setIsOpen(false);
    setSearchQuery('');
  };

  const displayText = selectedOption && selectedOption.value !== '' 
    ? selectedOption.label 
    : (parsedOptions.find(o => o.value === '')?.label || placeholder);

  const isPlaceholder = !selectedOption || selectedOption.value === '';

  return (
    <div 
      ref={containerRef} 
      style={{ position: 'relative', width: style.width || '100%', ...style }}
    >
      {/* Hidden real input for HTML5 required form validation */}
      {required && (
        <input
          tabIndex={-1}
          required={required}
          value={value || ''}
          onChange={() => {}}
          style={{
            opacity: 0,
            position: 'absolute',
            left: 0,
            bottom: 0,
            width: '100%',
            height: '1px',
            pointerEvents: 'none'
          }}
        />
      )}

      {/* Main Select Trigger Box with Search Button & Dropdown Arrow */}
      <div
        id={id}
        tabIndex={disabled ? -1 : 0}
        onClick={() => !disabled && setIsOpen(prev => !prev)}
        onKeyDown={(e) => {
          if (disabled) return;
          if (e.key === 'Enter' || e.key === ' ' || e.key === 'ArrowDown') {
            e.preventDefault();
            setIsOpen(true);
          } else if (e.key === 'Escape') {
            setIsOpen(false);
          }
        }}
        className={`form-control ${className}`}
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          cursor: disabled ? 'not-allowed' : 'pointer',
          userSelect: 'none',
          opacity: disabled ? 0.6 : 1,
          padding: '9px 12px',
          minHeight: '42px',
          boxSizing: 'border-box'
        }}
      >
        <span style={{
          overflow: 'hidden',
          textOverflow: 'ellipsis',
          whiteSpace: 'nowrap',
          color: isPlaceholder ? 'var(--text-muted, #94a3b8)' : 'var(--text-primary, #f8fafc)',
          marginRight: '8px'
        }}>
          {displayText}
        </span>

        {/* Search button and dropdown chevron container */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexShrink: 0 }}>
          <button
            type="button"
            title="Search options"
            onClick={(e) => {
              e.stopPropagation();
              if (!disabled) {
                setIsOpen(true);
              }
            }}
            style={{
              background: 'rgba(15, 118, 110, 0.08)',
              border: '1px solid rgba(15, 118, 110, 0.25)',
              borderRadius: '6px',
              padding: '3px 7px',
              color: 'var(--color-primary)',
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              gap: '4px',
              fontSize: '0.72rem',
              fontWeight: 500,
              transition: 'all 0.15s ease'
            }}
            onMouseEnter={(e) => {
              e.currentTarget.style.background = 'rgba(15, 118, 110, 0.16)';
              e.currentTarget.style.borderColor = 'var(--color-primary)';
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.background = 'rgba(15, 118, 110, 0.08)';
              e.currentTarget.style.borderColor = 'rgba(15, 118, 110, 0.25)';
            }}
          >
            <Search size={11} /> Search
          </button>

          <ChevronDown 
            size={14} 
            style={{
              color: 'var(--text-muted)',
              transform: isOpen ? 'rotate(180deg)' : 'none',
              transition: 'transform 0.2s ease'
            }} 
          />
        </div>
      </div>

      {/* Dropdown Floating Panel */}
      {isOpen && (
        <div style={{
          position: 'absolute',
          top: 'calc(100% + 4px)',
          left: 0,
          right: 0,
          backgroundColor: 'var(--card)',
          border: '1px solid var(--border)',
          borderRadius: '10px',
          boxShadow: '0 10px 25px -5px rgba(0, 0, 0, 0.15)',
          zIndex: 9999,
          overflow: 'hidden',
          animation: 'fadeIn 0.15s ease-out'
        }}>
          {/* Search Box Input Field */}
          <div style={{
            padding: '8px 10px',
            borderBottom: '1px solid var(--border)',
            backgroundColor: 'var(--card)',
            position: 'sticky',
            top: 0,
            zIndex: 1
          }}>
            <div style={{ position: 'relative', display: 'flex', alignItems: 'center' }}>
              <Search 
                size={14} 
                style={{
                  position: 'absolute',
                  left: '10px',
                  color: 'var(--text-muted)',
                  pointerEvents: 'none'
                }} 
              />
              <input
                ref={searchInputRef}
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Type to search..."
                style={{
                  width: '100%',
                  padding: '7px 30px 7px 30px',
                  backgroundColor: 'var(--secondary)',
                  border: '1px solid var(--border)',
                  borderRadius: '6px',
                  color: 'var(--text-primary)',
                  fontSize: '0.84rem',
                  outline: 'none',
                  boxSizing: 'border-box'
                }}
                onKeyDown={(e) => {
                  if (e.key === 'Escape') {
                    setIsOpen(false);
                    setSearchQuery('');
                  } else if (e.key === 'Enter') {
                    e.preventDefault();
                    if (filteredOptions.length > 0) {
                      handleSelect(filteredOptions[0].value);
                    }
                  }
                }}
              />
              {searchQuery && (
                <button
                  type="button"
                  onClick={() => setSearchQuery('')}
                  style={{
                    position: 'absolute',
                    right: '8px',
                    background: 'none',
                    border: 'none',
                    color: 'var(--text-muted)',
                    cursor: 'pointer',
                    padding: '2px',
                    display: 'flex',
                    alignItems: 'center'
                  }}
                >
                  <X size={13} />
                </button>
              )}
            </div>
          </div>

          {/* Options List */}
          <div style={{
            maxHeight: '220px',
            overflowY: 'auto',
            padding: '4px'
          }}>
            {filteredOptions.length === 0 ? (
              <div style={{
                padding: '12px',
                textAlign: 'center',
                color: 'var(--text-muted)',
                fontSize: '0.82rem'
              }}>
                No matching options found for "{searchQuery}"
              </div>
            ) : (
              filteredOptions.map((opt, idx) => {
                const isSelected = String(value) === String(opt.value);
                return (
                  <div
                    key={`${opt.value}-${idx}`}
                    onClick={() => handleSelect(opt.value)}
                    style={{
                      padding: '8px 12px',
                      borderRadius: '6px',
                      cursor: 'pointer',
                      fontSize: '0.85rem',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'space-between',
                      backgroundColor: isSelected ? 'rgba(15, 118, 110, 0.12)' : 'transparent',
                      color: isSelected ? 'var(--color-primary)' : (opt.value === '' ? 'var(--text-muted)' : 'var(--text-primary)'),
                      fontWeight: isSelected ? 600 : 400,
                      transition: 'background-color 0.12s ease'
                    }}
                    onMouseEnter={(e) => {
                      if (!isSelected) e.currentTarget.style.backgroundColor = 'var(--secondary)';
                    }}
                    onMouseLeave={(e) => {
                      if (!isSelected) e.currentTarget.style.backgroundColor = 'transparent';
                    }}
                  >
                    <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                      {opt.label}
                    </span>
                    {isSelected && <Check size={14} style={{ color: '#818cf8', flexShrink: 0, marginLeft: '8px' }} />}
                  </div>
                );
              })
            )}
          </div>
        </div>
      )}
    </div>
  );
}
