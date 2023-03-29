import { createSlice } from '@reduxjs/toolkit'

export const steamiesSlice = createSlice({
  name: 'steamies',
  initialState: {
    value: undefined,
  },
  reducers: {
    setAll: (state, action) => {
      state.value = action.payload
    },
  },
})

// Action creators are generated for each case reducer function
export const { setAll } = steamiesSlice.actions

export default steamiesSlice.reducer