import React from 'react'
import YouTube from 'react-youtube'

const Video = ({
  ytId,
  onVideoReady,
  ytVideoRef,
}) => {
  if (!ytId) {
    return null
  }

  return (<div key={ytId} ref={ytVideoRef} style={{scrollMarginTop: '48px'}}><YouTube
    id={ytId}
    videoId={ytId}
    className="youtube-video-container"
    iframeClassName="youtube-video-iframe"
    onReady={onVideoReady}
    opts={{
      origin: window.location.origin,
      rel: 0,
    }}
  /></div>)
}

export default Video