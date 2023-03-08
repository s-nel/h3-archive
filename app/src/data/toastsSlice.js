import { createSlice } from '@reduxjs/toolkit'

export const toastsSlice = createSlice({
  name: 'toasts',
  initialState: {
    value: {
      toasts: [],
      id: 0,
    }
  },
  reducers: {
    add: (state, action) => {
      state.value.toasts = [...state.value.toasts, {
        ...action.payload,
        id: `toast-${state.value.id}`,
      }]
      state.value.id += 1
    },
    remove: (state, action) => {
      state.value.toasts = state.value.toasts.filter(v => v.id === action.payload)
    },
  },
})

// Action creators are generated for each case reducer function
export const { add, remove } = toastsSlice.actions

export default toastsSlice.reducer