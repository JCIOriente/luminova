import { initializeApp } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';
import { onDocumentWritten } from 'firebase-functions/v2/firestore';

initializeApp();

const db = getFirestore();

exports.awardPoints = onDocumentWritten('/events/{id}', async (event) => {
  const date = new Date();
  const memberPointsRef = db
    .collection('memberPoints')
    .doc(date.getFullYear() + '')
    .collection(date.getMonth() + 1 + '')
    .doc(event.params.id);

  const afterData = event.data.after.data() || {};
  const currentCoDirectorIds = afterData.coDirectorIds || [];
  const currentCollaboratorIds = afterData.collaboratorIds || [];
  const currentAssistantIds = afterData.assistantIds || [];

  const memberPointsSnapshot = await memberPointsRef.get();
  const dbOperation = memberPointsSnapshot.exists ? 'update' : 'set';
  const resDoc = await memberPointsRef[dbOperation]({
    director: afterData.directorId,
    name: afterData.name,
    coDirectorIds: currentCoDirectorIds,
    collaboratorIds: currentCollaboratorIds,
    assistantIds: currentAssistantIds,
  });

  console.log(
    "Document operation '%s' executed at time: %s",
    dbOperation,
    resDoc.writeTime.toDate(),
  );
});
