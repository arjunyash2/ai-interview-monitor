from rest_framework.decorators import api_view
from rest_framework.response import Response
from rest_framework import status
from django.utils import timezone
from django.shortcuts import get_object_or_404
from .models import Session, Event, EmotionSnapshot
from .serializers import (
    SessionSerializer, SessionListSerializer,
    StartSessionSerializer, LogEventSerializer,
    EndSessionSerializer, EmotionSnapshotSerializer
)


@api_view(['POST'])
def start_session(request):
    """Start a new monitoring session"""
    serializer = StartSessionSerializer(data=request.data)
    if serializer.is_valid():
        session = Session.objects.create(
            candidate_name=serializer.validated_data.get('candidate_name', ''),
            candidate_email=serializer.validated_data.get('candidate_email', ''),
            job_role=serializer.validated_data.get('job_role', ''),
            status='active'
        )
        # Log system event
        Event.objects.create(
            session=session,
            event_type='system',
            severity='info',
            message='Monitoring session started'
        )
        return Response(
            {'session_id': str(session.id), 'status': 'started'},
            status=status.HTTP_201_CREATED
        )
    return Response(serializer.errors, status=status.HTTP_400_BAD_REQUEST)


@api_view(['POST'])
def log_event(request, session_id):
    """Log a malpractice or behavioral event"""
    session = get_object_or_404(Session, id=session_id)
    serializer = LogEventSerializer(data=request.data)

    if serializer.is_valid():
        Event.objects.create(
            session=session,
            event_type=serializer.validated_data['event_type'],
            severity=serializer.validated_data['severity'],
            message=serializer.validated_data['message'],
            metadata=serializer.validated_data.get('metadata', {})
        )

        # Update counts based on event type
        event_type = serializer.validated_data['event_type']
        if event_type == 'tab_switch':
            session.tab_switch_count += 1
        elif event_type == 'face_absent':
            session.face_absent_count += 1
        elif event_type == 'multi_face':
            session.multi_face_count += 1
        elif event_type == 'gaze_away':
            session.look_away_count += 1
        elif event_type == 'audio_spike':
            session.audio_anomaly_count += 1

        session.save()
        return Response({'status': 'logged'}, status=status.HTTP_201_CREATED)

    return Response(serializer.errors, status=status.HTTP_400_BAD_REQUEST)


@api_view(['POST'])
def log_emotion_snapshot(request, session_id):
    """Log periodic emotion snapshot"""
    session = get_object_or_404(Session, id=session_id)
    data = request.data.copy()
    data['session'] = session.id

    serializer = EmotionSnapshotSerializer(data=data)
    if serializer.is_valid():
        serializer.save()
        return Response({'status': 'saved'}, status=status.HTTP_201_CREATED)
    return Response(serializer.errors, status=status.HTTP_400_BAD_REQUEST)


@api_view(['POST'])
def end_session(request, session_id):
    """End session and store final scores"""
    session = get_object_or_404(Session, id=session_id)
    serializer = EndSessionSerializer(data=request.data)

    if serializer.is_valid():
        data = serializer.validated_data
        overall = data['overall_score']

        # Determine verdict
        if overall >= 80:
            verdict = 'recommended'
            verdict_detail = 'Candidate performed well. Proceed to next round.'
        elif overall >= 65:
            verdict = 'review'
            verdict_detail = 'Manual review recommended before proceeding.'
        elif overall >= 50:
            verdict = 'concerning'
            verdict_detail = 'Several integrity flags raised. Careful review needed.'
        else:
            verdict = 'flagged'
            verdict_detail = 'Significant integrity concerns detected.'

        # Update session
        session.status = 'flagged' if overall < 50 else 'completed'
        session.ended_at = timezone.now()
        session.duration_seconds = data['duration_seconds']
        session.attention_score = data['attention_score']
        session.integrity_score = data['integrity_score']
        session.engagement_score = data['engagement_score']
        session.confidence_score = data['confidence_score']
        session.overall_score = overall
        session.tab_switch_count = data['tab_switch_count']
        session.face_absent_count = data['face_absent_count']
        session.multi_face_count = data['multi_face_count']
        session.look_away_count = data['look_away_count']
        session.audio_anomaly_count = data.get('audio_anomaly_count', 0)
        session.verdict = verdict
        session.verdict_detail = verdict_detail
        session.save()

        # Log end event
        Event.objects.create(
            session=session,
            event_type='system',
            severity='info',
            message='Monitoring session ended'
        )

        return Response(SessionSerializer(session).data)

    return Response(serializer.errors, status=status.HTTP_400_BAD_REQUEST)


@api_view(['GET'])
def get_session(request, session_id):
    """Get full session details"""
    session = get_object_or_404(Session, id=session_id)
    return Response(SessionSerializer(session).data)


@api_view(['GET'])
def list_sessions(request):
    """List all sessions for HR dashboard"""
    sessions = Session.objects.all()
    serializer = SessionListSerializer(sessions, many=True)
    return Response(serializer.data)


@api_view(['GET'])
def dashboard_stats(request):
    """Overall stats for HR dashboard"""
    total = Session.objects.count()
    completed = Session.objects.filter(status='completed').count()
    flagged = Session.objects.filter(status='flagged').count()

    avg_score = Session.objects.filter(
        status__in=['completed', 'flagged']
    ).values_list('overall_score', flat=True)

    avg = sum(avg_score) / len(avg_score) if avg_score else 0

    return Response({
        'total_sessions': total,
        'completed': completed,
        'flagged': flagged,
        'average_score': round(avg, 1),
    })