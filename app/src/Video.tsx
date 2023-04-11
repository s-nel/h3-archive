import React from 'react'
import YouTube from 'react-youtube'

const Video = ({
  event,
  onVideoReady,
  ytVideoRef,
}) => {
  const ytLink = event.links.find(l => l.type === 'youtube')
  const [ytPlayer, setYtPlayer] = React.useState(null)

  var regExp = /^.*(youtu\.be\/|v\/|u\/\w\/|embed\/|watch\?v=|\&v=)([^#\&\?]*).*/
  const match = ytLink && ytLink.url && ytLink.url.match(regExp)
  const ytId = match && match[2].length === 11 && match[2]

  //console.log(ytId)

  if (!ytId) {
    return null
  }

  return (<div key={ytId} ref={ytVideoRef}><YouTube
    id={ytId}
    videoId={ytId}
    className="youtube-video-container"
    iframeClassName="youtube-video-iframe"
    onReady={onVideoReady}
    opts={{
      origin: window.location.origin,
    }}
  /></div>)
}

export default Video