import { initializeApp } from 'firebase-admin/app';
import {
  DocumentReference,
  FieldValue,
  FirestoreError,
  getFirestore,
} from 'firebase-admin/firestore';
import { onDocumentWritten } from 'firebase-functions/v2/firestore';

initializeApp();
const db = getFirestore();

type EventDocument = {
  directorId: string | null;
  name: string;
  coDirectorIds: string[];
  collaboratorIds: string[];
  participantIds: string[];
  type: string | null;
};

type PointRule = {
  role: string;
  points: number;
};

exports.awardPoints = onDocumentWritten('/events/{id}', async (event) => {
  const memberPointsRef = getMemberPointsReference(event.params.id);

  if (!event.data.after.exists) {
    await removeMemberPoints(memberPointsRef, event.params.id);
    return;
  }

  const eventData = extractEventData(event.data.after.data());

  if (!eventData.type) {
    console.warn(
      `Skipping points calculation for event %s: missing event type`,
      event.params.id,
    );
    return;
  }

  try {
    const points = await calculatePointsForRoles(eventData);

    await memberPointsRef.set(
      {
        director: eventData.directorId,
        name: eventData.name,
        coDirectorIds: eventData.coDirectorIds,
        collaboratorIds: eventData.collaboratorIds,
        participantIds: eventData.participantIds,
        points,
        updatedAt: FieldValue.serverTimestamp(),
      },
      { merge: true },
    );

    console.log('Member points updated for event %s', event.params.id);
  } catch (error) {
    console.error(
      'Error updating member points for event %s:',
      event.params.id,
      error,
    );
  }
});

async function removeMemberPoints(
  memberPointsRef: DocumentReference,
  eventId: string,
) {
  try {
    await memberPointsRef.delete();
    console.log('Member points removed for deleted event %s', eventId);
  } catch (error) {
    const firestoreError = error as FirestoreError;

    if (firestoreError.code !== 'not-found') {
      console.error(
        'Error deleting member points for event %s:',
        eventId,
        firestoreError,
      );
    }
  }
}

function getMemberPointsReference(eventId: string): DocumentReference {
  const currentDate = new Date();
  return db
    .collection('memberPoints')
    .doc(currentDate.getFullYear().toString())
    .collection((currentDate.getMonth() + 1).toString())
    .doc(eventId);
}

function extractEventData(data: FirebaseFirestore.DocumentData = {}): EventDocument {
  return {
    directorId: typeof data.directorId === 'string' ? data.directorId : null,
    name: typeof data.name === 'string' ? data.name : '',
    coDirectorIds: Array.isArray(data.coDirectorIds)
      ? data.coDirectorIds.filter(Boolean)
      : [],
    collaboratorIds: Array.isArray(data.collaboratorIds)
      ? data.collaboratorIds.filter(Boolean)
      : [],
    participantIds: Array.isArray(data.participantIds)
      ? data.participantIds.filter(Boolean)
      : [],
    type: typeof data.type === 'string' ? data.type : null,
  };
}

async function calculatePointsForRoles(eventData: EventDocument) {
  const eventPoints = await fetchEventPoints(eventData.type);

  const directorPoints = calculateRolePoints(eventPoints, 'Director', [
    eventData.directorId,
  ]);
  const coDirectorPoints = calculateRolePoints(
    eventPoints,
    'CoDirector',
    eventData.coDirectorIds,
  );
  const collaboratorPoints = calculateRolePoints(
    eventPoints,
    'Collaborator',
    eventData.collaboratorIds,
  );
  const participantPoints = calculateRolePoints(
    eventPoints,
    'Participant',
    eventData.participantIds,
  );

  return aggregatePoints([
    ...directorPoints,
    ...coDirectorPoints,
    ...collaboratorPoints,
    ...participantPoints,
  ]);
}

async function fetchEventPoints(eventType: string | null): Promise<PointRule[]> {
  if (!eventType) {
    return [];
  }

  const snapshot = await db
    .collection('pointRules')
    .where('type', '==', eventType)
    .get();

  if (snapshot.empty) {
    return [];
  }

  return snapshot.docs.map((doc) => {
    const data = doc.data();
    return {
      role: data.role,
      points: Number(data.points ?? 0),
    } as PointRule;
  });
}

function calculateRolePoints(
  eventPoints: PointRule[],
  role: string,
  memberIds: Array<string | null>,
) {
  const rolePoints = eventPoints.find((rule) => rule.role === role)?.points || 0;

  return memberIds
    .filter((memberId): memberId is string => Boolean(memberId))
    .map((memberId) => ({
      id: memberId,
      points: Number(rolePoints),
    }));
}

function aggregatePoints(
  membersData: Array<{ id: string; points: number }>,
) {
  return membersData.reduce<Record<string, number>>((points, memberData) => {
    points[memberData.id] = (points[memberData.id] || 0) + memberData.points;
    return points;
  }, {});
}
